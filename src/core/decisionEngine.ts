// ====================================================
// FuelAmpel — Decision Engine (v2 — Dual Mode)
// Pure function. No React, no side effects.
// Input: stations + user state + price trend → Output: Go/Wait/Skip + mode
//
// v2 changes (2026-04-23):
//   - Dual-mode output: normal / plan_soon / refuel_soon
//   - German 2026-04-01 regulation: deleted isGoodWindow 16-19h hardcode
//   - resolveWhen(): time recommendation based on daysLeft × dayTrend
//   - Price trend integration (IntradayTrend + DayTrend)
// ====================================================

import {
  Station,
  DecisionResult,
  Recommendation,
  ReadinessLevel,
  FuelType,
  GeoLocation,
  SmartTankState,
  RefuelingStyle,
  DecisionZone,
  IntradayTrend,
  DayTrend,
} from '../utils/types';
import {
  THRESHOLD_ACTION_KM,
  THRESHOLD_MONITOR_KM,
  MAX_PRICE_ABOVE_MEDIAN,
  MAX_DATA_AGE_HOURS,
  SCORE_WEIGHT_SAVINGS,
  SCORE_WEIGHT_PROXIMITY,
  SCORE_WEIGHT_FRESHNESS,
  TANKER_SEARCH_RADIUS_KM,
  URGENCY_ACTION_DAYS,
  URGENCY_MONITOR_DAYS,
  NEAREMPTY_THRESHOLD_PCT,
  CHEAPEST_MIN_SAVING_GO_EUR,
  CHEAPEST_MIN_SAVING_WAIT_EUR,
  CONFIDENCE_HIGH,
  CONFIDENCE_MED,
  GOOD_DEAL_PCT_THRESHOLD,
  CHEAPEST_LEVEL_CEILING_PCT,
  PLAN_URGENT_DAYS,
  PLAN_BUFFER_DAYS,
  NOON_UPWARD_WINDOW_HOUR,
  ZONE_PLANNING_MAX_PCT,
} from '../utils/constants';
import { computeRefuelUrgency, classifyZone } from './smartTank';
import { computeNetVsNearest, findNearestOpen } from '../utils/ranking';


// ─── Step 1: Readiness Check ──────────────────────────────────────────────────

/**
 * Determine how urgently the user needs to refuel.
 */
export function computeReadiness(remainingKm: number): ReadinessLevel {
  if (remainingKm <= THRESHOLD_ACTION_KM) return 'Action';
  if (remainingKm <= THRESHOLD_MONITOR_KM) return 'Monitor';
  return 'NotNeeded';
}

// ─── Step 2: Station Filtering ────────────────────────────────────────────────

/**
 * Remove stations that are unsuitable:
 * - Closed
 * - Price missing/null
 * - Data too stale (> MAX_DATA_AGE_HOURS)
 * - Price significantly above regional median
 */
export function filterStations(stations: Station[]): Station[] {
  // Calculate regional median price among open stations with valid prices
  const validPrices = stations
    .filter((s) => s.isOpen && s.price !== null)
    .map((s) => s.price as number)
    .sort((a, b) => a - b);

  const median = computeMedian(validPrices);
  const maxAllowedPrice = median !== null ? median + MAX_PRICE_ABOVE_MEDIAN : Infinity;
  const maxAgeMs = MAX_DATA_AGE_HOURS * 3_600_000;
  const now = Date.now();

  return stations.filter((s) => {
    if (!s.isOpen) return false;
    if (s.price === null) return false;
    if (now - s.fetchedAt > maxAgeMs) return false;
    if (maxAllowedPrice !== Infinity && s.price > maxAllowedPrice) return false;
    return true;
  });
}

function computeMedian(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ─── Step 3: Station Scoring ──────────────────────────────────────────────────

interface ScoredStation {
  station: Station;
  score: number;
  savingVsMedian: number;
}

/**
 * Score each valid station.
 * score = savings(60%) + proximity(30%) + freshness(10%)
 *
 * All factors normalized 0–1 within the candidate set.
 */
export function scoreStations(
  stations: Station[],
  regionMedianPrice: number
): ScoredStation[] {
  if (stations.length === 0) return [];

  const maxDist = Math.max(...stations.map((s) => s.dist), 0.001);
  const now = Date.now();
  const maxAgeMs = MAX_DATA_AGE_HOURS * 3_600_000;

  return stations
    .map((s) => {
      const price = s.price as number;

      // Savings factor: how much cheaper vs median (clamped 0–1)
      const savingVsMedian = Math.max(0, regionMedianPrice - price);
      const savingNorm = Math.min(savingVsMedian / 0.1, 1); // 10¢ = max score

      // Proximity factor: closer is better
      const proxNorm = 1 - s.dist / maxDist;

      // Freshness factor: recently updated data is better
      const ageMs = now - s.fetchedAt;
      const freshnessNorm = 1 - Math.min(ageMs / maxAgeMs, 1);

      const score =
        savingNorm * SCORE_WEIGHT_SAVINGS +
        proxNorm * SCORE_WEIGHT_PROXIMITY +
        freshnessNorm * SCORE_WEIGHT_FRESHNESS;

      return { station: s, score, savingVsMedian };
    })
    .sort((a, b) => b.score - a.score);
}

// ─── resolveWhen: Plan Soon time recommendation ──────────────────────────────

/**
 * Determine WHEN the user should refuel (Plan Soon mode only).
 *
 * Based on:
 *   - daysLeft: urgency from SmartTank
 *   - dayTrend: today's price vs recent average
 *   - intradayTrend: real-time price direction
 *   - hour: current local hour
 *
 * Design rules:
 *   - Never predict tomorrow's price — only say "morgen erneut prüfen"
 *   - 12:00 = only allowed upward price window (German regulation 2026-04-01)
 *   - Low confidence trends → generic advice (no trend claim)
 */
function resolveWhen(
  daysLeft: number,
  dayTrend: DayTrend,
  intradayTrend: IntradayTrend,
  hour: number,
): string {
  // ── Urgent: must refuel today regardless of price ──
  if (daysLeft < PLAN_URGENT_DAYS) {
    if (hour < NOON_UPWARD_WINDOW_HOUR)
      return 'Bald tanken. Vor dem 12-Uhr-Fenster oft günstiger.';
    if (hour >= 12 && hour < 14)
      return 'Bald tanken nötig. Preise könnten später noch etwas fallen.';
    return 'Heute noch tanken.';
  }

  // ── Cheap day: seize the opportunity ──
  if (dayTrend.level === 'CHEAP_DAY' && dayTrend.confidence !== 'low') {
    if (hour < 11)
      return 'Heute günstiger als üblich. Am besten vor dem 12-Uhr-Fenster.';
    if (intradayTrend.direction === 'falling' && intradayTrend.confidence !== 'low')
      return 'Heute günstiger als üblich. Preise fallen gerade.';
    return 'Heute günstiger als üblich — guter Tag zum Tanken.';
  }

  // ── Expensive day + buffer ──
  if (dayTrend.level === 'EXPENSIVE' && dayTrend.confidence !== 'low') {
    if (daysLeft > PLAN_BUFFER_DAYS)
      return 'Heute etwas teurer als üblich. Morgen erneut prüfen.';
    return 'Etwas teurer, aber besser bald tanken.';
  }

  // ── Normal day / low confidence ──
  if (hour < 11)
    return 'Später Vormittag vor 12 Uhr könnte günstig sein.';
  if (intradayTrend.direction === 'falling' && intradayTrend.confidence !== 'low')
    return 'Preise fallen gerade — könnte ein guter Zeitpunkt sein.';
  if (hour > 19)
    return 'Morgen gegen späten Vormittag erneut prüfen.';
  return 'Später heute oder morgen erneut prüfen.';
}

// ─── Step 4: Final Decision ───────────────────────────────────────────────────

/**
 * Main decision function (v2 — dual mode).
 *
 * @param stations       Raw stations from API
 * @param remainingKm    Estimated km remaining (legacy fallback)
 * @param fuelType       Which fuel the user wants
 * @param userLocation   Optional user GPS location
 * @param smartTank      SmartTankState v2
 * @param refuelingStyle User's preferred refueling strategy
 * @param tankCapacityL  User's tank capacity in litres
 * @param confidence     0.0–1.0 confidence in levelPercent
 * @param corridorStation Best on-route corridor station (home→work or work→home)
 * @param intradayTrend  Real-time price direction (from priceTrend module)
 * @param dayTrend       Today vs 7-day average (from priceTrend module)
 */
export function computeDecision(
  stations: Station[],
  remainingKm: number,
  fuelType: FuelType,
  userLocation?: GeoLocation,
  smartTank?: SmartTankState | null,
  refuelingStyle: RefuelingStyle | null = null,
  tankCapacityL: number = 50,
  confidence: number = 0.5,
  corridorStation?: { brand: string; name: string; price: number | null; netSavingEur: number } | null,
  intradayTrend: IntradayTrend = { direction: 'stable', confidence: 'low' },
  dayTrend: DayTrend = { level: 'NORMAL', confidence: 'low' },
): DecisionResult {

  // --- Resolve current level % ---
  let levelPercent = 100;
  if (smartTank) {
    const urgency = computeRefuelUrgency(smartTank);
    levelPercent = urgency.levelPercent;
  } else {
    levelPercent = Math.max(0, Math.min(100, (remainingKm / 600) * 100));
  }

  // --- Zone & confidence-level ---
  const zone: DecisionZone = classifyZone(levelPercent);
  const confidenceLevel: DecisionResult['confidenceLevel'] =
    confidence >= CONFIDENCE_HIGH ? 'high' :
    confidence >= CONFIDENCE_MED  ? 'medium' : 'low';

  /** Trust Gate: very low confidence caps recommendation at 'Wait' */
  const trustCapAtWait = confidenceLevel === 'low';

  // --- Step 1: Readiness (base mapping) ---
  let readiness: ReadinessLevel = 'NotNeeded';
  if (smartTank) {
    const urgency = computeRefuelUrgency(smartTank);
    if (urgency.levelPercent <= NEAREMPTY_THRESHOLD_PCT) {
      readiness = 'Action';
    } else {
      readiness =
        urgency.daysUntilEmpty < URGENCY_ACTION_DAYS  ? 'Action'  :
        urgency.daysUntilEmpty < URGENCY_MONITOR_DAYS ? 'Monitor' : 'NotNeeded';
    }
  } else {
    readiness = computeReadiness(remainingKm);
  }

  // --- Step 2: Filter valid stations ---
  const validStations = filterStations(stations);
  if (validStations.length === 0) {
    return {
      recommendation: 'Skip',
      saving_estimate: 0,
      reason: 'Keine geeigneten Tankstellen in der Nähe gefunden. Daten möglicherweise veraltet.',
      readiness,
      zone,
      confidenceLevel,
      mode: zone === 'Safe' ? 'normal' : zone === 'Planning' ? 'plan_soon' : 'refuel_soon',
    };
  }

  // --- Step 3: Score and identify best station ---
  const sortedPrices = validStations.map((s) => s.price as number).sort((a, b) => a - b);
  const regionMedian = computeMedian(sortedPrices) ?? 0;
  const scored = scoreStations(validStations, regionMedian);

  // F5: Re-rank by net-€ saving (consistent with "⭐ Value" list sort in stations tab)
  const nearestStation = findNearestOpen(validStations);
  const bestByValue = [...scored].sort((a, b) =>
    computeNetVsNearest(b.station, nearestStation, tankCapacityL) -
    computeNetVsNearest(a.station, nearestStation, tankCapacityL)
  )[0] ?? scored[0];
  const best = bestByValue;

  if (!best) {
    return {
      recommendation: 'Skip',
      saving_estimate: 0,
      reason: 'Beste Tankstelle konnte nicht ermittelt werden.',
      readiness,
      zone,
      confidenceLevel,
      mode: zone === 'Safe' ? 'normal' : zone === 'Planning' ? 'plan_soon' : 'refuel_soon',
    };
  }

  const { station, savingVsMedian } = best;
  const brandName = station.brand || station.name;

  const priceStr    = (station.price as number).toFixed(3);          // e.g. "1.679"
  const netSavingEur = parseFloat(
    (computeNetVsNearest(station, nearestStation, tankCapacityL)).toFixed(2)
  );
  const netSavingStr = netSavingEur >= 0
    ? `+${netSavingEur.toFixed(2)} €`
    : `${netSavingEur.toFixed(2)} €`;
  const tankPctStr  = `${Math.round(levelPercent)}%`;

  // --- Step 4: Decision logic (V2 — Dual-Mode) ---

  // Resolve daysUntilEmpty for resolveWhen()
  let daysLeft = 99;
  if (smartTank) {
    const urgency = computeRefuelUrgency(smartTank);
    daysLeft = urgency.daysUntilEmpty;
  }

  // Value check (kept from V1)
  const cheapThreshold = regionMedian * (1 - GOOD_DEAL_PCT_THRESHOLD);
  const isGoodDeal = (station.price as number) <= cheapThreshold;

  // Effective ceiling: how high can the tank be before we ignore a good deal?
  const effectiveCeiling =
    refuelingStyle === 'nearEmpty' ? 30 : CHEAPEST_LEVEL_CEILING_PCT;

  // ── Mode: derive from zone ──
  const mode: DecisionResult['mode'] =
    zone === 'Safe' ? 'normal' :
    zone === 'Planning' ? 'plan_soon' : 'refuel_soon';

  // Corridor info for reason text
  const corridorLabel = corridorStation && corridorStation.price !== null
    ? ` ${corridorStation.brand} auf dem Weg — ${corridorStation.price.toFixed(3)} €/L.`
    : '';

  // ═══════════════════════════════════════════════════════════════════════
  // REFUEL SOON — Critical + Low zones: direct action, no trend analysis
  // ═══════════════════════════════════════════════════════════════════════

  if (zone === 'Critical') {
    return {
      recommendation: 'Go',
      station,
      saving_estimate: savingVsMedian,
      reason: `🔴 Tank fast leer (${tankPctStr}). Jetzt tanken bei ${brandName} — ${priceStr} €/L.`,
      readiness: 'Action',
      zone: 'Critical',
      confidenceLevel,
      mode: 'refuel_soon',
    };
  }

  if (zone === 'Low') {
    // Low zone: always Go or Wait, action-oriented
    if (isGoodDeal) {
      return {
        recommendation: trustCapAtWait ? 'Wait' : 'Go',
        station,
        saving_estimate: savingVsMedian,
        reason: `🟢 Tank niedrig (${tankPctStr}). ${brandName} ${priceStr} €/L — ${(savingVsMedian * 100).toFixed(1)}¢ günstiger. Vollgetankt ca. ${netSavingStr} gespart.`,
        readiness: 'Action',
        zone: 'Low',
        confidenceLevel,
        mode: 'refuel_soon',
      };
    }
    // Low + intradayTrend falling: encourage action now
    if (intradayTrend.direction === 'falling' && intradayTrend.confidence !== 'low') {
      return {
        recommendation: trustCapAtWait ? 'Wait' : 'Go',
        station,
        saving_estimate: savingVsMedian,
        reason: `🟡 Tank niedrig (${tankPctStr}). Preise fallen gerade — ${brandName} ${priceStr} €/L.`,
        readiness: 'Action',
        zone: 'Low',
        confidenceLevel,
        mode: 'refuel_soon',
      };
    }
    // Low + no deal + not falling: wait if possible
    return {
      recommendation: 'Wait',
      station,
      saving_estimate: savingVsMedian,
      reason: `🟡 Tank bei ${tankPctStr} — Preis aktuell durchschnittlich (${priceStr} €/L). Bald tanken.`,
      readiness: 'Monitor',
      zone: 'Low',
      confidenceLevel,
      mode: 'refuel_soon',
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PLAN SOON — Planning zone: when + where
  // ═══════════════════════════════════════════════════════════════════════

  if (zone === 'Planning') {
    const currentHour = new Date().getHours();
    const when = resolveWhen(daysLeft, dayTrend, intradayTrend, currentHour);

    // Good deal in Planning zone → Go (but respect ceiling)
    if (isGoodDeal && levelPercent <= effectiveCeiling) {
      return {
        recommendation: trustCapAtWait ? 'Wait' : 'Go',
        station,
        saving_estimate: savingVsMedian,
        reason: `🟢 ${brandName} ${priceStr} €/L — ${(savingVsMedian * 100).toFixed(1)}¢ günstiger. ${when}`,
        readiness: 'Monitor',
        zone: 'Planning',
        confidenceLevel,
        mode: 'plan_soon',
        when,
        dayTrend: dayTrend.confidence !== 'low' ? dayTrend : undefined,
      };
    }

    // Convenient mode: corridor station recommendation
    if (
      refuelingStyle === 'convenient' &&
      corridorStation &&
      corridorStation.netSavingEur > 0 &&
      levelPercent <= effectiveCeiling
    ) {
      const corridorName = corridorStation.brand || corridorStation.name;
      const corridorPriceStr = corridorStation.price !== null
        ? corridorStation.price.toFixed(3)
        : '—';
      return {
        recommendation: 'Wait',
        station,
        saving_estimate: savingVsMedian,
        reason: `🟡 ${when}${corridorLabel}`,
        readiness: 'Monitor',
        zone: 'Planning',
        confidenceLevel,
        mode: 'plan_soon',
        when,
        dayTrend: dayTrend.confidence !== 'low' ? dayTrend : undefined,
      };
    }

    // Planning zone + no deal + above ceiling → subtle hint
    if (levelPercent > effectiveCeiling) {
      return {
        recommendation: 'Skip',
        station,
        saving_estimate: savingVsMedian,
        reason: `Tank bei ${tankPctStr} — ${priceStr} €/L, noch kein Bedarf.`,
        readiness: 'NotNeeded',
        zone: 'Planning',
        confidenceLevel,
        mode: 'plan_soon',
        when,
        dayTrend: dayTrend.confidence !== 'low' ? dayTrend : undefined,
      };
    }

    // Default Planning: Wait with when recommendation
    return {
      recommendation: 'Wait',
      station,
      saving_estimate: savingVsMedian,
      reason: `🟡 Tank bei ${tankPctStr}. ${when}`,
      readiness: 'Monitor',
      zone: 'Planning',
      confidenceLevel,
      mode: 'plan_soon',
      when,
      dayTrend: dayTrend.confidence !== 'low' ? dayTrend : undefined,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // NORMAL — Safe zone: silent
  // ═══════════════════════════════════════════════════════════════════════

  return {
    recommendation: 'Skip',
    station,
    saving_estimate: savingVsMedian,
    reason: `Tank bei ${tankPctStr} — kein Handlungsbedarf.`,
    readiness: 'NotNeeded',
    zone,
    confidenceLevel,
    mode: 'normal',
  };
}
