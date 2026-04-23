// ====================================================
// FuelAmpel — Price Trend Module
//
// Two-level trend analysis:
//   Level 1: Intraday — within-day price direction
//   Level 2: Multi-day — today vs 7-14 day average
//
// Anti-noise design:
//   - Intraday snapshots are geo-bound (regionKey)
//   - Only same-region snapshots are compared
//   - Confidence gating prevents premature signals
//   - Threshold band prevents noise from being read as trend
//
// Pure functions — no side effects, no state mutation.
// ====================================================

import {
  PriceSnapshot,
  DailyPriceEntry,
  IntradayTrend,
  DayTrend,
  FuelType,
} from '../utils/types';
import {
  INTRADAY_TREND_THRESHOLD,
  DAY_TREND_CHEAP_FACTOR,
  DAY_TREND_EXPENSIVE_FACTOR,
  SNAPSHOT_REGION_PRECISION,
} from '../utils/constants';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generate a region key from lat/lng by rounding to SNAPSHOT_REGION_PRECISION.
 * Example: (50.941, 6.958) @ 0.05 precision → "50.95_6.95"
 */
export function makeRegionKey(lat: number, lng: number): string {
  const p = SNAPSHOT_REGION_PRECISION;
  const rLat = (Math.round(lat / p) * p).toFixed(2);
  const rLng = (Math.round(lng / p) * p).toFixed(2);
  return `${rLat}_${rLng}`;
}

/**
 * Get today's date key in 'YYYY-MM-DD' format (local timezone).
 */
export function todayDateKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── Level 1: Intraday Trend ──────────────────────────────────────────────────

/**
 * Compute the intraday price trend from recent snapshots.
 *
 * Rules:
 *   1. Only snapshots matching the LATEST regionKey are considered
 *      (prevents location-switch from polluting the trend).
 *   2. At least 3 same-region snapshots needed; otherwise → stable + low confidence.
 *   3. Average sequential delta compared to ±INTRADAY_TREND_THRESHOLD.
 */
export function computeIntradayTrend(snapshots: PriceSnapshot[]): IntradayTrend {
  if (snapshots.length < 2) {
    return { direction: 'stable', confidence: 'low' };
  }

  // Filter to latest region only
  const latestRegion = snapshots[snapshots.length - 1].regionKey;
  const sameRegion = snapshots.filter(s => s.regionKey === latestRegion);

  if (sameRegion.length < 3) {
    return { direction: 'stable', confidence: 'low' };
  }

  // Compute average sequential delta
  const deltas: number[] = [];
  for (let i = 1; i < sameRegion.length; i++) {
    deltas.push(sameRegion[i].observedBestPrice - sameRegion[i - 1].observedBestPrice);
  }
  const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;

  // Confidence: high if 5+ same-region points, medium if 3-4
  const confidence = sameRegion.length >= 5 ? 'high' : 'medium';

  if (avgDelta < -INTRADAY_TREND_THRESHOLD) {
    return { direction: 'falling', confidence };
  }
  if (avgDelta > INTRADAY_TREND_THRESHOLD) {
    return { direction: 'rising', confidence };
  }
  return { direction: 'stable', confidence };
}

// ─── Level 2: Multi-Day Trend ─────────────────────────────────────────────────

/**
 * Compute the multi-day price trend (today vs recent average).
 *
 * Rules:
 *   1. At least 3 historical entries required; otherwise → NORMAL + low confidence.
 *   2. Compares todayObserved to the mean of priceHistory.observedBestPrice.
 *   3. ±2% threshold band to avoid noise.
 */
export function computeDayTrend(
  history: DailyPriceEntry[],
  todayObserved: number,
): DayTrend {
  if (history.length < 3) {
    return { level: 'NORMAL', confidence: 'low' };
  }

  const avg =
    history.reduce((sum, e) => sum + e.observedBestPrice, 0) / history.length;

  const confidence: DayTrend['confidence'] = history.length >= 7 ? 'high' : 'medium';

  if (todayObserved < avg * DAY_TREND_CHEAP_FACTOR) {
    return { level: 'CHEAP_DAY', confidence };
  }
  if (todayObserved > avg * DAY_TREND_EXPENSIVE_FACTOR) {
    return { level: 'EXPENSIVE', confidence };
  }
  return { level: 'NORMAL', confidence };
}
