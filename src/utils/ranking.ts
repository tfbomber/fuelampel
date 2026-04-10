// ====================================================
// FuelAmpel — Smart Ranking Model (v2)
//
// ─── Price/Distance sort: ±Δ vs area median (€/L) ────────────────────────────
//   Shows cents-per-litre deviation from the region's median price.
//   Standard reference — intuitive for price comparison.
//
// ─── Value sort: net € vs NEAREST open station ───────────────────────────────
//   Question answered: "Is it worth going HERE instead of the nearest station?"
//
//   net_vs_nearest = (nearest.price - this.price) × FILL_UP_L
//                  - (this.dist - nearest.dist) × COST_PER_KM
//
//   +€   → you save money vs just going to the nearest station (worth the detour)
//    0   → this IS the nearest station (baseline)
//   -€   → you'd lose money going here vs the nearest station (not worth it)
//
// Example:
//   Nearest:  ARAL  0.5km  1.679€   → baseline (0.0€)
//   Shell:    3.0km  1.629€  → (1.679-1.629)×40 - (3.0-0.5)×0.15 = 2.00 - 0.375 = +1.63€ ✓
//   Esso:     1.2km  1.699€  → (1.679-1.699)×40 - (1.2-0.5)×0.15 = -0.80 - 0.105 = -0.91€ ✗
// ====================================================

import { Station } from './types';

// ─── Tunable constants ────────────────────────────────────────────────────────

const FILL_UP_LITRES = 40;     // Assumed fill-up volume (litres)
const COST_PER_KM   = 0.15;   // €/km fuel cost for the detour
// Note: station.dist is already OSRM-corrected (×1.18) from fuelStore.
// No additional road_factor needed here.

// ─── Nearest station finder ───────────────────────────────────────────────────

/**
 * Find the nearest open station with a known price.
 * This is the "baseline" for Value comparisons.
 */
export function findNearestOpen(stations: Station[]): Station | null {
  const open = stations.filter(s => s.isOpen && s.price !== null);
  if (open.length === 0) return null;
  return open.reduce((best, s) => s.dist < best.dist ? s : best);
}

// ─── Value score ──────────────────────────────────────────────────────────────

/**
 * Net € saving of going to `station` instead of the nearest open station.
 *
 * @param station      Candidate station
 * @param nearest      The nearest open station (baseline)
 * @param fillUpLitres User's tank capacity in litres (from settings)
 */
export function computeNetVsNearest(
  station: Station,
  nearest: Station | null,
  fillUpLitres = 40
): number {
  if (station.price === null) return -Infinity;
  if (nearest === null)       return 0;

  const priceSaving  = (nearest.price! - station.price) * FILL_UP_LITRES;
  const extraDetour  = (station.dist - nearest.dist) * COST_PER_KM;

  return parseFloat((priceSaving - extraDetour).toFixed(2));
}

/**
 * Format value delta for display.
 *
 * If this station IS the nearest: shows "📍 base"
 * Otherwise: "+1.6€" or "-0.9€" (total for fillUpLitres, vs nearest)
 */
export function formatNetVsNearest(
  station: Station,
  nearest: Station | null,
  fillUpLitres = 40
): string {
  if (!nearest || station.price === null) return '—';
  if (station.id === nearest.id)          return '📍 base';

  const val = computeNetVsNearest(station, nearest, fillUpLitres);
  if (val === -Infinity) return '—';
  const sign = val >= 0 ? '+' : '';
  return `${sign}${val.toFixed(1)}€`;
}

// ─── Sort ─────────────────────────────────────────────────────────────────────

/**
 * Sort stations by Value score (best net saving vs nearest first).
 * Open stations always rank above closed ones in Value mode.
 */
export function sortByValue(stations: Station[]): Station[] {
  const nearest = findNearestOpen(stations);

  return [...stations].sort((a, b) => {
    // Closed stations always sink to bottom in value mode
    if (a.isOpen && !b.isOpen) return -1;
    if (!a.isOpen && b.isOpen) return 1;

    return computeNetVsNearest(b, nearest) - computeNetVsNearest(a, nearest);
  });
}

// ─── Legacy export (kept for fallback) ───────────────────────────────────────

/** @deprecated Use computeNetVsNearest instead */
export function computeNetSaving(station: Station, regionMedian: number): number {
  if (station.price === null) return -Infinity;
  const priceSaving = (regionMedian - station.price) * FILL_UP_LITRES;
  const detourCost  = station.dist * COST_PER_KM;
  return parseFloat((priceSaving - detourCost).toFixed(2));
}

/** @deprecated Use formatNetVsNearest instead */
export function formatNetSaving(netSaving: number): string {
  if (netSaving === -Infinity) return '—';
  const sign = netSaving >= 0 ? '+' : '';
  return `${sign}${netSaving.toFixed(1)}€`;
}

/**
 * Estimated road distance from straight-line (legacy, kept for safety).
 */
export function estRoadDist(straightLineKm: number): number {
  return parseFloat((straightLineKm * 1.3).toFixed(1));
}
