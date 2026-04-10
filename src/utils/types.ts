// ====================================================
// FuelAmpel — Shared Type Definitions
// Single source of truth for all domain types.
// ====================================================

// --- Fuel Types ---
export type FuelType = 'e5' | 'e10' | 'diesel';

// --- Refueling Preferences (collected during Onboarding) ---
export type RefuelingStyle =
  | 'convenient'  // 遵路就加
  | 'nearEmpty'   // 快没油再加
  | 'cheapest'    // 哪里便宜去哪里
  | 'noHabit';   // 没固定习惯

export type CarType =
  | 'small'    // 小车
  | 'regular'  // 普通家用车
  | 'large'    // 大车 / SUV
  | 'unknown'; // 不确定

export type LastRefuelAmount =
  | '<40'     // < 40 €
  | '40-60'   // 40–60 €
  | '60-80'   // 60–80 €
  | '80+'     // 80 € +
  | 'unknown'; // 不记得

// Common area user usually refuels in (up to 2; slot 0 = Home, slot 1 = Work)
export interface CommonArea {
  plz: string;           // postal code (extracted from resolved address, or user input)
  displayName: string;   // short label shown in the input field after selection
  loc: GeoLocation | null;
}

// --- Location ---
export interface GeoLocation {
  lat: number;
  lng: number;
}

// --- Station (matches Tankerkoenig API response shape) ---
export interface Station {
  id: string;
  name: string;
  brand: string;
  street: string;
  place: string;
  lat: number;
  lng: number;
  dist: number;          // km from user (road distance via OSRM)
  price: number | null;  // price for selected fuel type
  isOpen: boolean;
  fetchedAt: number;     // Unix timestamp ms — when we got this data
}

// --- Decision Engine ---
export type ReadinessLevel = 'NotNeeded' | 'Monitor' | 'Action';
export type Recommendation = 'Go' | 'Wait' | 'Skip';
/** Internal zone classification — computed, never stored. */
export type DecisionZone = 'Critical' | 'Low' | 'Planning' | 'Safe';

export interface DecisionResult {
  recommendation: Recommendation;
  station?: Station;
  saving_estimate: number;  // €/L vs regional median
  reason: string;
  readiness: ReadinessLevel;
  zone: DecisionZone;
  confidenceLevel: 'high' | 'medium' | 'low';
}

// --- Shadow Tank State ---
export interface ShadowTankState {
  lastRefuelTimeMs: number;        // When user last refueled
  kmAtLastRefuel: number;          // Estimated km remaining at last refuel
  avgConsumptionPer100km: number;  // User's average consumption (L/100km)
  tankCapacityL: number;           // Tank size in litres
}

// --- User Preferences ---
export interface UserPreferences {
  fuelType: FuelType;
  homeLocation?: GeoLocation;
  workLocation?: GeoLocation;
  shadowTank: ShadowTankState;
}

// --- Notification State ---
export interface NotificationState {
  lastNotifiedMs: number;
}

// =============================================================================
// Smart Shadow Tank v2
// =============================================================================

/** A single confirmed refuel event. */
export interface RefuelEvent {
  timestampMs: number;
  /** Litres added; 0 means user tapped "full tank" (derive from capacity). */
  litresAdded: number;
  confirmedBy: 'user_tap' | 'post_navigation' | 'low_alert';
}

/**
 * One foreground location snapshot.
 * Stores DISTANCES only — no lat/lng coordinates are persisted.
 */
export interface DaySnapshot {
  dateISO: string;              // "2026-03-30"
  dayOfWeek: number;            // 0=Sun … 6=Sat
  timeMs: number;
  distFromHomeKm: number;
  distFromWorkKm: number | null; // null if no work PLZ configured
  status: 'HOME' | 'WORK' | 'AWAY' | 'UNKNOWN';
}

/** A recurring trip pattern detected from repeated same-DOW AWAY snapshots. */
export interface TripPattern {
  dayOfWeek: number;
  approxRoundTripKm: number;
  occurrenceCount: number;
  kmVariance: number;           // std-dev of observed distances
  status: 'OBSERVING' | 'CANDIDATE' | 'COMMITTED' | 'CONFIRMED';
  confirmedByUser: boolean;
  lastAskedMs: number | null;
}

/** The single source of truth for the Smart Shadow Tank engine. */
export interface SmartTankState {
  // ── Core truth ────────────────────────────────────────────────────────────
  levelPercent: number;              // 0–100
  lastConfirmedMs: number;
  lastConfirmedBy: 'refuel' | 'manual' | 'low_alert_confirm';
  /**
   * Confidence in levelPercent. 0.0 (blind guess) – 1.0 (just confirmed by refuel).
   * Recomputed by computeConfidence() each time the value is consumed.
   * Stored so it persists and degrades over time across restarts.
   */
  confidence: number;

  // ── Refuel history (rolling last 10) ─────────────────────────────────────
  refuelHistory: RefuelEvent[];
  /** Average days between refuels; null until 2+ events recorded. */
  refuelIntervalEMA: number | null;

  // ── Daily consumption model ───────────────────────────────────────────────
  /** km/day learned from refuel calibration; primary source once available. */
  dailyKmEMA: number;
  /** km/day from PLZ haversine × 2 × commuteDays; used until EMA is ready. */
  dailyKmFromPLZ: number;
  consumptionPer100km: number;
  tankCapacityL: number;
  /**
   * Optional: km range on a full tank (user-supplied).
   * When set, enables "≈ ZZZ km" display without needing explicit L/100km.
   * remainingKm = (levelPercent / 100) * totalRangeKm
   */
  totalRangeKm: number | null;

  // ── Trip detection ────────────────────────────────────────────────────────
  /** Rolling 8-week snapshot log; max 224 entries. */
  snapshots: DaySnapshot[];
  /** Learned fraction of workdays spent commuting (0–5 days/week). */
  commuteDaysPerWeekEMA: number;
  /** Detected recurring weekly trip patterns; max 7 entries. */
  tripPatterns: TripPattern[];

  // ── Pop-up guards ─────────────────────────────────────────────────────────
  lastPatternAskedMs: number | null;
  lastNavigatedToStationMs: number | null;
  pendingRefuelConfirm: boolean;
}
