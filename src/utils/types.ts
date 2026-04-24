// ====================================================
// FuelAmpel — Shared Type Definitions
// Single source of truth for all domain types.
// ====================================================

// --- Fuel Types ---
export type FuelType = 'e5' | 'e10' | 'diesel';

// --- Refueling Preferences (collected during Onboarding) ---
export type RefuelingStyle =
  | 'convenient'  // 遵路就加
  | 'nearEmpty';  // 快没油再加

export type CarType =
  | 'small'    // 小车
  | 'regular'  // 普通家用车
  | 'large'    // 大车 / SUV
  | 'unknown'; // 不确定



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
  /** Active display price — re-picked from raw prices when fuel type changes. */
  price: number | null;
  /** Raw prices cached from single API fetch — never null after first load. */
  priceE5:     number | null;
  priceE10:    number | null;
  priceDiesel: number | null;
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

  // Decision Engine v2 — dual-mode output
  /** App state: normal (silent), plan_soon (when+where), refuel_soon (now+where) */
  mode: 'normal' | 'plan_soon' | 'refuel_soon';
  /** Plan Soon only: time recommendation in German (e.g. "Heute nach Feierabend") */
  when?: string;
  /** Multi-day price trend for optional UI badge */
  dayTrend?: DayTrend;
}

// --- Price Trend Module ---

/** A single intraday price observation, geo-bound to prevent location-switch noise. */
export interface PriceSnapshot {
  ts: number;                // fetch timestamp
  observedBestPrice: number; // min price of all open stations in this fetch
  regionKey: string;         // lat/lng rounded to SNAPSHOT_REGION_PRECISION (~5km grid)
}

/** Daily price observation for multi-day trend analysis. */
export interface DailyPriceEntry {
  dateKey: string;            // 'YYYY-MM-DD'
  observedBestPrice: number;  // best price we saw that day (NOT guaranteed day minimum)
  fuelType: FuelType;
}

/** Intraday price direction within one region. */
export interface IntradayTrend {
  direction: 'falling' | 'rising' | 'stable';
  confidence: 'low' | 'medium' | 'high';
}

/** Multi-day price level relative to recent history. */
export interface DayTrend {
  level: 'CHEAP_DAY' | 'NORMAL' | 'EXPENSIVE';
  confidence: 'low' | 'medium' | 'high';
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
