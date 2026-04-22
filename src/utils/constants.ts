// ====================================================
// FuelAmpel — App Constants
// All thresholds and configuration in one place.
// ====================================================

// --- Tankerkoenig API ---
// Real key — DO NOT commit to public repos.
// Register: https://creativecommons.tankerkoenig.de
export const TANKER_API_KEY = '480df09d-735e-47ea-a4b0-52463a9f83d0';
export const TANKER_API_BASE = 'https://creativecommons.tankerkoenig.de/json';
export const TANKER_SEARCH_RADIUS_KM = 5;

// --- Decision Engine Thresholds ---
export const THRESHOLD_ACTION_KM = 80;       // Below this → Action (must refuel soon)
export const THRESHOLD_MONITOR_KM = 150;     // Below this → Monitor (keep an eye)
export const MAX_PRICE_ABOVE_MEDIAN = 0.05;  // Filter: exclude stations > median + 5¢
export const MAX_DATA_AGE_HOURS = 6;         // Filter: ignore stale data older than 6h

// New mode thresholds
export const NEAREMPTY_THRESHOLD_PCT      = 15;   // %
export const CHEAPEST_LEVEL_CEILING_PCT   = 60;   // %  (>60% → ignore good deals)
export const CHEAPEST_MIN_SAVING_GO_EUR   = 2.0;  // €
export const CHEAPEST_MIN_SAVING_WAIT_EUR = 1.0;  // €
export const GOOD_DEAL_PCT_THRESHOLD      = 0.03; // 3% cheaper than median is a GOOD DEAL
export const TANK_CONFIRM_LOCK_DAYS       = 5;    // Days to wait before showing confirm modal again

// --- Decision Zones (internal classification, maps from levelPercent) ---
export const ZONE_CRITICAL_MAX_PCT    = 15;   // ≤ 15% → Critical  (same as NEAREMPTY)
export const ZONE_LOW_MAX_PCT         = 30;   // ≤ 30% → Low       (push if good station)
export const ZONE_PLANNING_MAX_PCT    = 50;   // ≤ 50% → Planning  (in-app only)
// > 50% → Safe (fully silent)

// --- Confidence Score Thresholds ---
export const CONFIDENCE_HIGH     = 0.70;  // ≥ 0.70 → no ~ prefix, full notification allowed
export const CONFIDENCE_MED      = 0.40;  // ≥ 0.40 → ~ prefix shown
export const CONFIDENCE_PUSH_MIN = 0.40;  // minimum confidence to send push (Critical bypasses)

// --- Weekly Notification Budget ---
export const NOTIFICATION_WEEKLY_CAP = 3;   // max non-Critical pushes per 7-day window

// --- Station Scoring Weights ---
export const SCORE_WEIGHT_SAVINGS = 0.6;
export const SCORE_WEIGHT_PROXIMITY = 0.3;
export const SCORE_WEIGHT_FRESHNESS = 0.1;

// --- Shadow Tank Defaults ---
export const DEFAULT_AVG_CONSUMPTION = 7.5;  // L/100km
export const DEFAULT_TANK_CAPACITY = 50;     // Litres
export const DEFAULT_REMAINING_KM = 300;     // Initial assumption if user hasn't set

// --- Notification Cooldown ---
export const NOTIFICATION_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours in ms
export const MIN_SAVINGS_FOR_NOTIFICATION = 0.02; // €/L minimum to notify

// --- Cache ---
export const STATION_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes (API fair use)

// =============================================================================
// Smart Shadow Tank v2 — Thresholds & Learning Parameters
// =============================================================================

// Location snapshot gating
export const SMART_TANK_HOME_RADIUS_KM        = 1.5;   // km from Home PLZ = "at home"
export const SMART_TANK_WORK_RADIUS_KM        = 1.5;   // km from Work PLZ = "at work"
export const SMART_TANK_SNAPSHOT_GAP_MS       = 3 * 60 * 60 * 1000;  // min 3h between snapshots
export const SMART_TANK_SNAPSHOT_REOPEN_MS    = 8 * 60 * 60 * 1000;  // force snapshot after 8h gap

// Pattern detection thresholds
export const SMART_TANK_PATTERN_MIN_COUNT     = 4;    // occurrences to reach CANDIDATE
export const SMART_TANK_PATTERN_COMMIT_COUNT  = 6;    // occurrences to reach COMMITTED
export const SMART_TANK_PATTERN_DIST_BAND_KM  = 5;    // ±5 km tolerance to match same pattern
export const SMART_TANK_PATTERN_ASK_GAP_MS    = 7 * 24 * 60 * 60 * 1000; // 7d between pop-up asks
export const SMART_TANK_PATTERN_KM_DIFF_PCT   = 0.30; // >30% diff from PLZ default → worth asking

// EMA learning rate (α = 0.25 → ~8 events to fully converge)
export const SMART_TANK_EMA_ALPHA             = 0.25;

// Rolling storage limits (< 25 KB total)
export const SMART_TANK_SNAPSHOT_MAX          = 224;  // 8 weeks × 4/day
export const SMART_TANK_REFUEL_HISTORY_MAX    = 10;

// Conservative consumption factor applied to all estimates
export const SMART_TANK_CONSERVATIVE_FACTOR   = 1.10;

// Defaults for new users (before any refuel events or location data)
export const SMART_TANK_DEFAULT_COMMUTE_DAYS  = 5.0;  // assume 5 days/week (most conservative)
export const SMART_TANK_DEFAULT_LEVEL_PCT     = 50;   // default slider value in onboarding

// Refuel confirmation triggers
export const REFUEL_CONFIRM_NAVIGATION_DELAY_MS = 20 * 60 * 1000; // 20 min after navigating
export const REFUEL_LOW_ALERT_THRESHOLD_PCT     = 12;              // % to trigger low-tank banner
export const REFUEL_TIMEOUT_PAST_ZERO_MS        = 2 * 24 * 60 * 60 * 1000; // 2d past predicted 0%

// Refuel urgency thresholds (days until empty)
export const URGENCY_ACTION_DAYS   = 1.5;  // < 1.5 days → Action
export const URGENCY_MONITOR_DAYS  = 3.5;  // < 3.5 days → Monitor

// Route corridor for on-route station recommendation
export const ROUTE_CORRIDOR_MAX_DETOUR_KM  = 3.0;    // max acceptable detour
export const ROUTE_CORRIDOR_FUEL_COST_BASE = 0.08;   // €/km operating cost estimate

// Unified detour cost for Value ranking (reflects ~7.5L/100km × ~1.70€/L ≈ 0.13€/km)
export const VALUE_RANKING_COST_PER_KM     = 0.13;
