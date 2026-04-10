// ====================================================
// FuelAmpel — Decision Engine
// Pure function. No React, no side effects.
// Input: stations + user state → Output: Go/Wait/Skip
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
  CHEAPEST_LEVEL_CEILING_PCT,
  CHEAPEST_MIN_SAVING_GO_EUR,
  CHEAPEST_MIN_SAVING_WAIT_EUR,
  CONFIDENCE_HIGH,
  CONFIDENCE_MED,
  GOOD_DEAL_PCT_THRESHOLD,
} from '../utils/constants';
import { computeRefuelUrgency, classifyZone } from './smartTank';


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

// ─── Step 4: Final Decision ───────────────────────────────────────────────────

/**
 * Main decision function.
 *
 * @param stations      Raw stations from API
 * @param remainingKm   Estimated km remaining (legacy fallback; used when smartTank is null)
 * @param fuelType      Which fuel the user wants
 * @param userLocation  Optional user GPS location
 * @param smartTank     SmartTankState v2 (preferred over remainingKm when available)
 * @param refuelingStyle User's preferred refueling strategy ('nearEmpty' or 'cheapest')
 * @param tankCapacityL User's tank capacity in litres
 */
export function computeDecision(
  stations: Station[],
  remainingKm: number,
  fuelType: FuelType,
  userLocation?: GeoLocation,
  smartTank?: SmartTankState | null,
  refuelingStyle: RefuelingStyle | null = null,
  tankCapacityL: number = 50,
  /** 0.0–1.0 confidence in levelPercent; affects Trust Gate */
  confidence: number = 0.5,
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
      reason: 'No suitable stations found nearby. Data may be stale.',
      readiness,
      zone,
      confidenceLevel,
    };
  }

  // --- Step 3: Score and identify best station ---
  const sortedPrices = validStations.map((s) => s.price as number).sort((a, b) => a - b);
  const regionMedian = computeMedian(sortedPrices) ?? 0;
  const scored = scoreStations(validStations, regionMedian);
  const best = scored[0];

  if (!best) {
    return {
      recommendation: 'Skip',
      saving_estimate: 0,
      reason: 'Cannot determine best station.',
      readiness,
      zone,
      confidenceLevel,
    };
  }

  const { station, savingVsMedian } = best;
  const brandName = station.brand || station.name;

  // --- Step 4: Decision logic (V1 Logic Tree) ---
  
  // Rule 1: Emergency override
  if (levelPercent <= 15) {
    return {
      recommendation: 'Go',
      station,
      saving_estimate: savingVsMedian,
      reason: `🔴 油量告急 (≤15%)，请尽快加油！`,
      readiness: 'Action',
      zone: 'Critical',
      confidenceLevel,
    };
  }

  // Rule 2: Value Check V1
  const cheapThreshold = regionMedian * (1 - GOOD_DEAL_PCT_THRESHOLD);
  const isGoodDeal = (station.price as number) <= cheapThreshold;
  const currentHour = new Date().getHours();
  const isGoodWindow = currentHour >= 16 && currentHour < 19;
  
  if (levelPercent < 30) {
    if (isGoodWindow || isGoodDeal) {
      return {
        recommendation: 'Go',
        station,
        saving_estimate: savingVsMedian,
        reason: isGoodDeal ? `🟢 今日好价！顺路加点更划算。` : `🟡 当前是傍晚降价窗口，刚好顺路可以补油。`,
        readiness: 'Action',
        zone: 'Low',
        confidenceLevel,
      };
    } else {
      return {
        recommendation: 'Wait',
        station,
        saving_estimate: savingVsMedian,
        reason: `🟡 油量不高，但当前价格一般，可稍加留意。`,
        readiness: 'Monitor',
        zone: 'Low',
        confidenceLevel,
      };
    }
  } else if (isGoodDeal) {
    return {
      recommendation: 'Go',
      station,
      saving_estimate: savingVsMedian,
      reason: `🟢 今日好价！低于周边均价 ${(GOOD_DEAL_PCT_THRESHOLD * 100).toFixed(0)}%，是不错的抄底机会。`,
      readiness: 'Monitor',
      zone: 'Planning',
      confidenceLevel,
    };
  } else {
    // Silent
    return {
      recommendation: 'Skip',
      station,
      saving_estimate: savingVsMedian,
      reason: `油量充足且价格暂无明显优势。`,
      readiness: 'NotNeeded',
      zone,
      confidenceLevel,
    };
  }
}
