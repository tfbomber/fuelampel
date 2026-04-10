// ====================================================
// FuelAmpel — Shadow Tank
// Estimates remaining fuel without GPS tracking.
// Uses time-based estimation from last refuel event.
// ====================================================

import { ShadowTankState } from '../utils/types';
import {
  DEFAULT_AVG_CONSUMPTION,
  DEFAULT_TANK_CAPACITY,
  DEFAULT_REMAINING_KM,
} from '../utils/constants';

// Assumed average driving speed for time-based estimation
const ASSUMED_AVG_SPEED_KMH = 40; // Conservative urban/mixed average

/**
 * Create a default shadow tank state.
 * Used on first app launch.
 */
export function createDefaultShadowTank(): ShadowTankState {
  return {
    lastRefuelTimeMs: Date.now(),
    kmAtLastRefuel: DEFAULT_REMAINING_KM,
    avgConsumptionPer100km: DEFAULT_AVG_CONSUMPTION,
    tankCapacityL: DEFAULT_TANK_CAPACITY,
  };
}

/**
 * Estimate current remaining km based on elapsed time since last refuel.
 *
 * Formula:
 *   hoursElapsed = (now - lastRefuelTime) / 3600000
 *   kmDriven = hoursElapsed * ASSUMED_AVG_SPEED_KMH
 *   remainingKm = kmAtLastRefuel - kmDriven
 *
 * Returns at minimum 0 (never negative).
 */
export function estimateRemainingKm(state: ShadowTankState): number {
  const nowMs = Date.now();
  const hoursElapsed = (nowMs - state.lastRefuelTimeMs) / 3_600_000;
  const kmDriven = hoursElapsed * ASSUMED_AVG_SPEED_KMH;
  const remaining = state.kmAtLastRefuel - kmDriven;
  return Math.max(0, Math.round(remaining));
}

/**
 * Calculate estimated remaining fuel in litres.
 */
export function estimateRemainingLitres(state: ShadowTankState): number {
  const remainingKm = estimateRemainingKm(state);
  const litres = (remainingKm / 100) * state.avgConsumptionPer100km;
  return Math.max(0, parseFloat(litres.toFixed(1)));
}

/**
 * Reset the shadow tank after the user refuels.
 * Call this when user taps "I refueled".
 *
 * @param state  - current state
 * @param litresFueled - how many litres were added (optional, defaults to full tank)
 * @returns new state with full tank
 */
export function resetShadowTank(
  state: ShadowTankState,
  litresFueled?: number
): ShadowTankState {
  const litres = litresFueled ?? state.tankCapacityL;
  const newKm = (litres / state.avgConsumptionPer100km) * 100;
  return {
    ...state,
    lastRefuelTimeMs: Date.now(),
    kmAtLastRefuel: Math.round(newKm),
  };
}

/**
 * Update average consumption (user edits it in settings).
 */
export function updateConsumption(
  state: ShadowTankState,
  newConsumptionL100km: number
): ShadowTankState {
  return {
    ...state,
    avgConsumptionPer100km: Math.max(3, Math.min(25, newConsumptionL100km)),
  };
}

/**
 * Get fuel level percentage (0–100) for UI progress bar.
 */
export function getFuelLevelPercent(state: ShadowTankState): number {
  const litres = estimateRemainingLitres(state);
  const pct = (litres / state.tankCapacityL) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}
