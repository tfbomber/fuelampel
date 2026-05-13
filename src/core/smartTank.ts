// ====================================================
// FuelAmpel — Smart Shadow Tank Engine  (v2)
// Pure functions. No React. No side effects.
//
// Single source of truth: SmartTankState.levelPercent
// All other data serves to keep that number honest.
// ====================================================

import {
  SmartTankState,
  RefuelEvent,
  DaySnapshot,
  TripPattern,
  GeoLocation,
  CommonArea,
} from '../utils/types';
import {
  SMART_TANK_EMA_ALPHA,
  SMART_TANK_CONSERVATIVE_FACTOR,
  SMART_TANK_MAX_DECAY_DAYS,
  SMART_TANK_HOME_RADIUS_KM,
  SMART_TANK_WORK_RADIUS_KM,
  SMART_TANK_SNAPSHOT_MAX,
  SMART_TANK_REFUEL_HISTORY_MAX,
  SMART_TANK_PATTERN_MIN_COUNT,
  SMART_TANK_PATTERN_COMMIT_COUNT,
  SMART_TANK_PATTERN_DIST_BAND_KM,
  SMART_TANK_PATTERN_ASK_GAP_MS,
  SMART_TANK_PATTERN_KM_DIFF_PCT,
  SMART_TANK_DEFAULT_COMMUTE_DAYS,
  SMART_TANK_DEFAULT_LEVEL_PCT,
  URGENCY_ACTION_DAYS,
  URGENCY_MONITOR_DAYS,
  DEFAULT_AVG_CONSUMPTION,
  DEFAULT_TANK_CAPACITY,
  ZONE_CRITICAL_MAX_PCT,
  ZONE_LOW_MAX_PCT,
  ZONE_PLANNING_MAX_PCT,
  CALIBRATION_HISTORY_MAX,
  BIAS_SIGNIFICANT_PCT,
  PERSONAL_BUFFER_KM_PER_WEEK,
} from '../utils/constants';
import { CalibrationRecord } from '../utils/types';

// ─── Geometry helpers ─────────────────────────────────────────────────────────

const DEG2RAD = Math.PI / 180;

/** Haversine great-circle distance in km. */
export function haversineKm(a: GeoLocation, b: GeoLocation): number {
  const dLat = (b.lat - a.lat) * DEG2RAD;
  const dLng = (b.lng - a.lng) * DEG2RAD;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(a.lat * DEG2RAD) * Math.cos(b.lat * DEG2RAD) * sinDLng * sinDLng;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// ─── PLZ distance helper ──────────────────────────────────────────────────────

/**
 * Estimate one-way commute distance from two CommonAreas.
 * Returns 0 if either area has no location resolved.
 */
function plzOnewayKm(home: CommonArea, work?: CommonArea): number {
  if (!home.loc || !work?.loc) return 0;
  return haversineKm(home.loc, work.loc);
}

// ─── EMA helper ───────────────────────────────────────────────────────────────

function ema(currentEMA: number, newValue: number, alpha = SMART_TANK_EMA_ALPHA): number {
  return alpha * newValue + (1 - alpha) * currentEMA;
}

// ─── Confidence & Zone ────────────────────────────────────────────────────────────────────────────

import { DecisionZone } from '../utils/types';

/**
 * Compute a fresh confidence score (0.0–1.0) from state.
 * Call this every time you need to read or store confidence.
 *
 * Formula (Phase 2 — Dual-Confidence):
 *   levelConf  = levelConfidence × age_factor   (decays over 7 days, floor 0.15)
 *   effective  = min(levelConf, modelConfidence) (bounded by structural model trust)
 *   bonus      = +0.05 if any trip pattern user-confirmed
 *   final      = clamp(0, 1, effective + bonus)
 *
 * Critical zone (≤15%) bypasses this gate in scheduleDailyCheck.
 */
export function computeConfidence(state: SmartTankState): number {
  const hoursElapsed = (Date.now() - state.lastConfirmedMs) / 3_600_000;
  const decayFraction = hoursElapsed / (7 * 24); // full decay over 7 days
  const ageFactor = Math.max(0.15, 1.0 - decayFraction);

  const currentLevelConf = state.levelConfidence * ageFactor;
  let effective = Math.min(currentLevelConf, state.modelConfidence);

  if (state.tripPatterns.some(p => p.status === 'CONFIRMED')) effective += 0.05;

  return Math.min(1.0, Math.max(0.0, effective));
}

/**
 * Classify current tank level into an operational zone.
 *
 * Critical  (≤ 15%): emergency, always notify
 * Low       (≤ 30%): 16:00 push eligible + in-app badge
 * Planning  (≤ 50%): in-app only, no push
 * Safe      (> 50%): fully silent
 */
export function classifyZone(levelPercent: number): DecisionZone {
  if (levelPercent <= ZONE_CRITICAL_MAX_PCT)  return 'Critical';
  if (levelPercent <= ZONE_LOW_MAX_PCT)       return 'Low';
  if (levelPercent <= ZONE_PLANNING_MAX_PCT)  return 'Planning';
  return 'Safe';
}

// ─── A. createDefaultSmartTank ────────────────────────────────────────────────

/**
 * Build the initial SmartTankState for a new user.
 *
 * @param home      First commonArea (Home PLZ) — must be set at onboarding.
 * @param work      Second commonArea (Work PLZ) — optional.
 * @param initialPct Initial fuel level % from onboarding slider (default 50).
 * @param consumptionPer100km  User's stated consumption (default 7.5 L/100km).
 * @param tankCapacityL         User's tank size (default 50 L).
 */
export function createDefaultSmartTank(
  home?: CommonArea,
  work?: CommonArea,
  initialPct = SMART_TANK_DEFAULT_LEVEL_PCT,
  consumptionPer100km = DEFAULT_AVG_CONSUMPTION,
  tankCapacityL = DEFAULT_TANK_CAPACITY,
): SmartTankState {
  const onewayKm = home ? plzOnewayKm(home, work) : 0;
  // Round-trip × 5 working days / 7 days = average daily km from commute
  const commuteDailyKm = onewayKm > 0
    ? (onewayKm * 2 * SMART_TANK_DEFAULT_COMMUTE_DAYS) / 7
    : 15; // absolute fallback: ~15 km/day if no PLZ distance

  console.log(
    `[SmartTank] init: oneway=${onewayKm.toFixed(1)} km, dailyFromPLZ=${commuteDailyKm.toFixed(1)} km/day, level=${initialPct}%`
  );

  return {
    levelPercent: initialPct,
    lastConfirmedMs: Date.now(),
    lastConfirmedBy: 'manual',
    // Dual-confidence model (Phase 1)
    levelConfidence: 1.0,  // user just confirmed in onboarding — full trust
    modelConfidence: 0.3,  // no history yet — low initial trust in consumption model
    calibrationHistory: [],

    refuelHistory: [],
    refuelIntervalEMA: null,

    dailyKmEMA: commuteDailyKm,
    dailyKmFromPLZ: commuteDailyKm,
    consumptionPer100km,
    tankCapacityL,
    totalRangeKm: null,

    snapshots: [],
    commuteDaysPerWeekEMA: SMART_TANK_DEFAULT_COMMUTE_DAYS,
    tripPatterns: [],

    lastPatternAskedMs: null,
    lastNavigatedToStationMs: null,
    pendingRefuelConfirm: false,
  };
}

// ─── A2. setTotalRangeKm ──────────────────────────────────────────────────────

/**
 * Pure helper: update totalRangeKm on an existing SmartTankState.
 * Pass null to clear (reverts Tank Bar to % display).
 */
export function setTotalRangeKm(
  state: SmartTankState,
  rangeKm: number | null,
): SmartTankState {
  const clamped = rangeKm !== null ? Math.max(50, Math.min(2000, Math.round(rangeKm))) : null;
  console.log(`[SmartTank] totalRangeKm set to ${clamped ?? 'null'}`);
  return { ...state, totalRangeKm: clamped };
}

// ─── B. estimateDailyKm ───────────────────────────────────────────────────────

interface DailyKmComponents {
  baseDailyKm: number;      // from refuelInterval EMA or PLZ
  patternKm: number;        // from COMMITTED/CONFIRMED tripPatterns (per day avg)
  bufferKm: number;         // PERSONAL_BUFFER_KM_PER_WEEK / 7
  totalKmEstimate: number;  // = (base + pattern + buffer) × conservative factor
}

/**
 * Calculate how many km the user is estimated to drive per day.
 *
 * Priority:
 *   1. refuelIntervalEMA-derived (most accurate after 2+ refuels)
 *   2. PLZ-based commute estimate (Day 1 default)
 *
 * Fixed weekly trip patterns (COMMITTED/CONFIRMED) add on top.
 * Conservative factor (1.10) is applied to the total.
 */
export function estimateDailyKm(state: SmartTankState): DailyKmComponents {
  let baseDailyKm: number;

  if (state.refuelIntervalEMA !== null) {
    // Derive from refuel frequency:
    // Full usable range = tankCapacity × 85% draw-down assumption
    const usableL = state.tankCapacityL * 0.85;
    const fullRangeKm = (usableL / state.consumptionPer100km) * 100;
    baseDailyKm = fullRangeKm / state.refuelIntervalEMA;
  } else {
    // Use PLZ-derived or EMA-seeded daily km
    baseDailyKm = state.dailyKmEMA;
  }

  // Add committed / confirmed fixed weekly patterns (km per day average)
  const patternKm = state.tripPatterns
    .filter(p => p.status === 'COMMITTED' || p.status === 'CONFIRMED')
    .reduce((sum, p) => sum + p.approxRoundTripKm / 7, 0);

  const bufferKm = PERSONAL_BUFFER_KM_PER_WEEK / 7;

  const totalKmEstimate =
    (baseDailyKm + patternKm + bufferKm) * SMART_TANK_CONSERVATIVE_FACTOR;

  return { baseDailyKm, patternKm, bufferKm, totalKmEstimate };
}

// ─── B2. updateCommuteDistance ────────────────────────────────────────────────

/**
 * Apply actual road distance from OSRM to refine the dailyKm estimate.
 * Used asynchronously after createDefaultSmartTank has seeded the initial state.
 */
export function updateCommuteDistance(
  state: SmartTankState,
  roadOnewayKm: number
): SmartTankState {
  const commuteDailyKm = roadOnewayKm > 0
    ? (roadOnewayKm * 2 * state.commuteDaysPerWeekEMA) / 7
    : 15; // absolute fallback: ~15 km/day if no work address or fetch failed

  console.log(
    `[SmartTank] Road commute updated (OSRM): oneway=${roadOnewayKm.toFixed(1)} km, dailyFromPLZ=${commuteDailyKm.toFixed(1)} km/day`
  );

  return {
    ...state,
    dailyKmFromPLZ: commuteDailyKm,
    // Only update dailyKmEMA if we haven't locked onto a reliable refuelIntervalEMA yet
    dailyKmEMA: state.refuelIntervalEMA === null ? commuteDailyKm : state.dailyKmEMA,
  };
}

// ─── C. estimateLevelPercent ──────────────────────────────────────────────────

/**
 * Estimate current fuel level % based on confirmed state + daily decay.
 * Returns 0 at minimum (never negative).
 */
export function estimateLevelPercent(state: SmartTankState): number {
  const { totalKmEstimate } = estimateDailyKm(state);
  const daysSinceConfirmed = (Date.now() - state.lastConfirmedMs) / 86_400_000;
  const cappedDays = Math.min(daysSinceConfirmed, SMART_TANK_MAX_DECAY_DAYS);

  const fullRangeKm = (state.tankCapacityL / state.consumptionPer100km) * 100;
  const kmConsumed = cappedDays * totalKmEstimate;
  const litresConsumed = (kmConsumed / 100) * state.consumptionPer100km;
  const litresUsedPct = (litresConsumed / state.tankCapacityL) * 100;

  const estimated = state.levelPercent - litresUsedPct;
  return Math.max(0, Math.round(estimated * 10) / 10);
}

// ─── D. recordRefuel ──────────────────────────────────────────────────────────

/**
 * Record a refuel event.
 * - Resets levelPercent
 * - Updates refuelIntervalEMA
 * - Back-calculates actual dailyKm over the period → updates dailyKmEMA
 *
 * @param state         Current state
 * @param litresAdded   Litres added; 0 means "full tank"
 * @param confirmedBy   How the refuel was detected
 */
export function recordRefuel(
  state: SmartTankState,
  litresAdded: number,
  confirmedBy: RefuelEvent['confirmedBy'],
): SmartTankState {
  const now = Date.now();
  const actualLitres = litresAdded === 0 ? state.tankCapacityL : litresAdded;
  const clampedLitres = Math.min(actualLitres, state.tankCapacityL);

  const currentEstimatedPct = estimateLevelPercent(state);
  const addedPct = (clampedLitres / state.tankCapacityL) * 100;
  const newLevelPct = litresAdded === 0 ? 100 : Math.min(100, Math.round(currentEstimatedPct + addedPct));

  const newEvent: RefuelEvent = {
    timestampMs: now,
    litresAdded: clampedLitres,
    confirmedBy,
  };

  // --- Update refuelIntervalEMA ---
  let newIntervalEMA = state.refuelIntervalEMA;
  const lastRefuel = state.refuelHistory[state.refuelHistory.length - 1];
  if (lastRefuel) {
    const intervalDays = (now - lastRefuel.timestampMs) / 86_400_000;
    // Only trust intervals in a plausible range (0.5 – 60 days)
    if (intervalDays >= 0.5 && intervalDays <= 60) {
      newIntervalEMA =
        newIntervalEMA === null
          ? intervalDays
          : ema(newIntervalEMA, intervalDays);
    }
  }

  // --- Back-calculate actual daily km from this refuel event ---
  let newDailyKmEMA = state.dailyKmEMA;
  if (lastRefuel) {
    const periodDays = (now - lastRefuel.timestampMs) / 86_400_000;
    if (periodDays >= 0.5) {
      const kmDrivenThisPeriod =
        (clampedLitres / state.consumptionPer100km) * 100;
      const actualDailyKm = kmDrivenThisPeriod / periodDays;
      newDailyKmEMA = ema(newDailyKmEMA, actualDailyKm);
    }
  }

  // --- Rolling history (keep last N) ---
  const newHistory = [
    ...state.refuelHistory,
    newEvent,
  ].slice(-SMART_TANK_REFUEL_HISTORY_MAX);

  console.log(
    `[SmartTank] Refuel recorded: ${clampedLitres.toFixed(1)}L via ${confirmedBy}. ` +
    `IntervalEMA=${newIntervalEMA?.toFixed(1) ?? 'n/a'}d, dailyKmEMA=${newDailyKmEMA.toFixed(1)}`
  );

  return {
    ...state,
    levelPercent: newLevelPct,
    lastConfirmedMs: now,
    lastConfirmedBy: 'refuel',
    levelConfidence: 1.0, // hard truth: refuel = maximum confidence
    // A real refuel event is also a model validation signal — nudge modelConfidence up.
    modelConfidence: Math.min(1.0, state.modelConfidence + 0.1),
    refuelHistory: newHistory,
    refuelIntervalEMA: newIntervalEMA,
    dailyKmEMA: newDailyKmEMA,
    pendingRefuelConfirm: false,
  };
}

// ─── E. applyDaySnapshot ─────────────────────────────────────────────────────

/**
 * Process a new foreground location snapshot.
 * - Classifies it as HOME / WORK / AWAY
 * - Updates commuteDaysPerWeekEMA on weekdays
 * - Feeds trip pattern detection for AWAY snapshots
 * - Trims snapshot list to SNAPSHOT_MAX
 */
export function applyDaySnapshot(
  state: SmartTankState,
  snapshot: DaySnapshot,
): SmartTankState {
  const isWeekday = snapshot.dayOfWeek >= 1 && snapshot.dayOfWeek <= 5;
  let newCommuteDays = state.commuteDaysPerWeekEMA;

  if (isWeekday) {
    // commuteDaysPerWeekEMA: update only on weekdays
    // If WORK detected → this day counts as 1 commute day
    // If HOME all day (checked once per day) → counts as 0
    // Strategy: only update once per calendar day
    const lastTodaySnapshot = state.snapshots.findLast(
      s => s.dateISO === snapshot.dateISO && s.status === 'WORK'
    );
    if (snapshot.status === 'WORK' && !lastTodaySnapshot) {
      // First WORK detection today → confirm commute
      newCommuteDays = ema(newCommuteDays, 1);
    }
    // NOTE: We do NOT decrement on HOME detections within the same day
    // (user might be WFH and still open app multiple times)
    // End-of-day HOME-only check is handled in estimateDailyKm via EMA history
  }

  // --- Pattern detection for AWAY snapshots (non-Home, non-Work) ---
  let newPatterns = [...state.tripPatterns];
  if (snapshot.status === 'AWAY' && snapshot.distFromHomeKm > 0) {
    newPatterns = updateTripPatterns(newPatterns, snapshot);
  }

  // --- Rolling snapshot storage ---
  const newSnapshots = [
    ...state.snapshots,
    snapshot,
  ].slice(-SMART_TANK_SNAPSHOT_MAX);

  return {
    ...state,
    snapshots: newSnapshots,
    commuteDaysPerWeekEMA: newCommuteDays,
    tripPatterns: newPatterns,
  };
}

// ─── F. updateTripPatterns (internal) ────────────────────────────────────────

function updateTripPatterns(
  patterns: TripPattern[],
  snapshot: DaySnapshot,
): TripPattern[] {
  const roundTripKm = snapshot.distFromHomeKm * 2;
  const dow = snapshot.dayOfWeek;

  // Find an existing pattern that matches this DOW + distance band
  const matchIndex = patterns.findIndex(
    p =>
      p.dayOfWeek === dow &&
      Math.abs(p.approxRoundTripKm - roundTripKm) <= SMART_TANK_PATTERN_DIST_BAND_KM,
  );

  if (matchIndex >= 0) {
    const existing = patterns[matchIndex];
    const newCount = existing.occurrenceCount + 1;

    // Update running variance (Welford online algorithm, simplified)
    const delta = roundTripKm - existing.approxRoundTripKm;
    const newAvgKm = existing.approxRoundTripKm + delta / newCount;
    const newVariance = Math.max(
      0,
      existing.kmVariance + ((delta * (roundTripKm - newAvgKm)) / newCount - existing.kmVariance) * 0.3,
    );

    const upgraded: TripPattern = {
      ...existing,
      occurrenceCount: newCount,
      approxRoundTripKm: newAvgKm,
      kmVariance: newVariance,
      status: upgradePatternStatus(existing.status, newCount, newVariance),
    };
    const updated = [...patterns];
    updated[matchIndex] = upgraded;
    return updated;
  }

  // New pattern candidate — only add if we haven't hit the max (7)
  if (patterns.length < 7) {
    const newPattern: TripPattern = {
      dayOfWeek: dow,
      approxRoundTripKm: roundTripKm,
      occurrenceCount: 1,
      kmVariance: 0,
      status: 'OBSERVING',
      confirmedByUser: false,
      lastAskedMs: null,
    };
    return [...patterns, newPattern];
  }

  return patterns;
}

function upgradePatternStatus(
  current: TripPattern['status'],
  count: number,
  variance: number,
): TripPattern['status'] {
  if (current === 'CONFIRMED') return 'CONFIRMED'; // user confirmed, never downgrade here
  if (count >= SMART_TANK_PATTERN_COMMIT_COUNT && variance < SMART_TANK_PATTERN_DIST_BAND_KM) {
    return 'COMMITTED';
  }
  if (count >= SMART_TANK_PATTERN_MIN_COUNT) return 'CANDIDATE';
  return 'OBSERVING';
}

// ─── G. shouldAskPatternConfirm ──────────────────────────────────────────────

/**
 * Returns true if we should show the pattern confirmation banner for this pattern.
 * All conditions must be met simultaneously.
 */
export function shouldAskPatternConfirm(
  state: SmartTankState,
  pattern: TripPattern,
): boolean {
  if (pattern.status !== 'CANDIDATE') return false;
  if (pattern.confirmedByUser) return false;
  if (pattern.lastAskedMs !== null) return false; // already asked once

  // Global pop-up guard: don't ask again within 7 days of ANY pattern ask
  if (
    state.lastPatternAskedMs !== null &&
    Date.now() - state.lastPatternAskedMs < SMART_TANK_PATTERN_ASK_GAP_MS
  ) {
    return false;
  }

  // Only ask if the pattern meaningfully changes the daily km estimate
  const { baseDailyKm } = estimateDailyKm(state);
  const patternDailyContribution = pattern.approxRoundTripKm / 7;
  const relativeImpact = patternDailyContribution / Math.max(baseDailyKm, 1);
  if (relativeImpact < SMART_TANK_PATTERN_KM_DIFF_PCT) return false;

  return true;
}

/**
 * Apply the user's answer to a pattern confirmation.
 */
export function confirmPattern(
  state: SmartTankState,
  dayOfWeek: number,
  userConfirmed: boolean,
): SmartTankState {
  const now = Date.now();
  const newPatterns = state.tripPatterns.map(p => {
    if (p.dayOfWeek !== dayOfWeek) return p;
    return {
      ...p,
      confirmedByUser: userConfirmed,
      lastAskedMs: now,
      status: (userConfirmed ? 'CONFIRMED' : p.status) as TripPattern['status'],
    };
  });
  return {
    ...state,
    tripPatterns: newPatterns,
    lastPatternAskedMs: now,
  };
}

// ─── H. applyManualLevelCorrection ───────────────────────────────────────────

/** User explicitly sets current level via slider. */
export function applyManualLevelCorrection(
  state: SmartTankState,
  newPercent: number,
): SmartTankState {
  const clamped = Math.max(0, Math.min(100, Math.round(newPercent)));
  console.log(`[SmartTank] Manual correction: level set to ${clamped}%`);

  const now = Date.now();
  const estimatedLevel = estimateLevelPercent(state);
  const errorPct = clamped - estimatedLevel;

  const newRecord: CalibrationRecord = {
    timestampMs: now,
    predictedPct: estimatedLevel,
    actualPct: clamped,
    errorPct,
  };

  const newHistory = [...state.calibrationHistory, newRecord].slice(-CALIBRATION_HISTORY_MAX);

  let newDailyKmEMA = state.dailyKmEMA;
  let newModelConfidence = state.modelConfidence;

  // BiasTracker: Check for 3 consecutive directional errors
  if (newHistory.length >= 3) {
    const last3 = newHistory.slice(-3);
    const allNegative = last3.every(r => r.errorPct <= -BIAS_SIGNIFICANT_PCT); // Consuming faster than thought
    const allPositive = last3.every(r => r.errorPct >= BIAS_SIGNIFICANT_PCT);  // Consuming slower than thought

    if (allNegative || allPositive) {
      // Apply structural adjustment
      const adjustment = allNegative ? 1.10 : 0.90;
      newDailyKmEMA = state.dailyKmEMA * adjustment;
      newModelConfidence = Math.min(1.0, state.modelConfidence + 0.1);
      console.log(`[BiasTracker] Structural drift detected. Adjusting dailyKmEMA by ${adjustment}x to ${newDailyKmEMA.toFixed(1)}`);
      // Clear history after correction to avoid feedback loop (safe splice on non-const array)
      newHistory.splice(0);
    } else {
      // Mixed errors → variance, drop confidence slightly
      newModelConfidence = Math.max(0.1, state.modelConfidence - 0.05);
    }
  }

  return {
    ...state,
    levelPercent: clamped,
    lastConfirmedMs: now,
    lastConfirmedBy: 'manual',
    levelConfidence: 0.85, // manual = high trust, but not verified by a refuel
    modelConfidence: newModelConfidence,
    calibrationHistory: newHistory,
    dailyKmEMA: newDailyKmEMA,
  };
}

// ─── I. computeRefuelUrgency ──────────────────────────────────────────────────

export interface RefuelUrgency {
  levelPercent: number;           // current estimated level %
  daysUntilEmpty: number;         // fractional days until 0%
  readiness: 'Action' | 'Monitor' | 'NotNeeded';
}

/**
 * The primary output consumed by the decision engine and notification system.
 */
export function computeRefuelUrgency(state: SmartTankState): RefuelUrgency {
  const levelPercent = estimateLevelPercent(state);
  const { totalKmEstimate } = estimateDailyKm(state);

  // litres remaining → km remaining → days remaining
  const litresRemaining = (levelPercent / 100) * state.tankCapacityL;
  const kmRemaining = (litresRemaining / state.consumptionPer100km) * 100;
  const daysUntilEmpty = totalKmEstimate > 0
    ? kmRemaining / totalKmEstimate
    : 999; // effectively infinite if no driving detected

  const readiness: RefuelUrgency['readiness'] =
    daysUntilEmpty < URGENCY_ACTION_DAYS  ? 'Action'  :
    daysUntilEmpty < URGENCY_MONITOR_DAYS ? 'Monitor' : 'NotNeeded';

  return { levelPercent, daysUntilEmpty, readiness };
}

// ─── J. getDailyKmComponents (debug) ─────────────────────────────────────────

/** Returns a human-readable breakdown of daily km estimation. Used in debug/settings. */
export function getDailyKmComponents(state: SmartTankState): {
  source: 'refuel_ema' | 'plz_estimate';
  baseDailyKm: number;
  patternKm: number;
  bufferKm: number;
  totalWithConservative: number;
  refuelIntervalDays: number | null;
} {
  const { baseDailyKm, patternKm, bufferKm, totalKmEstimate } = estimateDailyKm(state);
  return {
    source: state.refuelIntervalEMA !== null ? 'refuel_ema' : 'plz_estimate',
    baseDailyKm: Math.round(baseDailyKm * 10) / 10,
    patternKm: Math.round(patternKm * 10) / 10,
    bufferKm: Math.round(bufferKm * 10) / 10,
    totalWithConservative: Math.round(totalKmEstimate * 10) / 10,
    refuelIntervalDays: state.refuelIntervalEMA
      ? Math.round(state.refuelIntervalEMA * 10) / 10
      : null,
  };
}

// ─── K. classifySnapshot (exported for useLocationSnapshot hook) ──────────────

/**
 * Given raw distances, classify the snapshot status.
 * Called by useLocationSnapshot before storing — so no coordinates are passed to storage.
 */
export function classifySnapshot(
  distFromHomeKm: number,
  distFromWorkKm: number | null,
): DaySnapshot['status'] {
  if (distFromHomeKm <= SMART_TANK_HOME_RADIUS_KM) return 'HOME';
  if (distFromWorkKm !== null && distFromWorkKm <= SMART_TANK_WORK_RADIUS_KM) return 'WORK';
  if (distFromHomeKm > SMART_TANK_HOME_RADIUS_KM) return 'AWAY';
  return 'UNKNOWN';
}

// ─── L. migrateFromShadowTank (one-time migration) ───────────────────────────

import { ShadowTankState } from '../utils/types';

/**
 * One-time migration from the old ShadowTankState to SmartTankState.
 * Called on first launch after update; preserves approximate level estimate.
 */
export function migrateFromShadowTank(
  old: ShadowTankState,
  home?: CommonArea,
  work?: CommonArea,
): SmartTankState {
  // Estimate current level from old km-based model
  // Use a realistic 30km/day average instead of 40km/h to avoid 0% for users who migrated late.
  const daysElapsed = (Date.now() - old.lastRefuelTimeMs) / 86_400_000;
  const kmDriven = daysElapsed * 30;
  const remaining = Math.max(0, old.kmAtLastRefuel - kmDriven);
  const fullRangeKm = (old.tankCapacityL / old.avgConsumptionPer100km) * 100;
  const estimatedPct = Math.min(100, Math.round((remaining / fullRangeKm) * 100));

  const base = createDefaultSmartTank(
    home, work,
    estimatedPct,
    old.avgConsumptionPer100km,
    old.tankCapacityL,
  );

  console.log(
    `[SmartTank] Migrated from shadowTank: oldKm=${old.kmAtLastRefuel}, estimatedLevel=${estimatedPct}%`
  );

  return {
    ...base,
    lastConfirmedMs: old.lastRefuelTimeMs,
    lastConfirmedBy: 'refuel',
  };
}
