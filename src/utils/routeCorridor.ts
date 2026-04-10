// ====================================================
// FuelAmpel — Route Corridor Utility
// Finds the best gas station that lies on (or near)
// the user's Home → Work commute route.
//
// "On route" = adding the station detour increases
//              total distance by < MAX_DETOUR_KM.
// ====================================================

import { GeoLocation, Station } from './types';
import {
  ROUTE_CORRIDOR_MAX_DETOUR_KM,
  ROUTE_CORRIDOR_FUEL_COST_BASE,
} from './constants';

// ─── Haversine (local copy to avoid circular import from smartTank) ───────────

const DEG2RAD = Math.PI / 180;

function hvKm(a: GeoLocation, b: GeoLocation): number {
  const dLat = (b.lat - a.lat) * DEG2RAD;
  const dLng = (b.lng - a.lng) * DEG2RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * DEG2RAD) * Math.cos(b.lat * DEG2RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CorridorStation extends Station {
  /** Extra km the user must travel to include this station on their commute. */
  detourKm: number;
  /** Net saving in € after accounting for the detour fuel cost. */
  netSavingEur: number;
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Find the best on-route station between Home and Work.
 *
 * Scoring: netSaving = (price diff vs median × fillLitres) − (detourKm × fuelCostBase)
 *
 * Returns null if:
 *  - work location is not set
 *  - no station passes the detour filter
 *  - no station is cheaper than median
 */
export function findCorridorStation(
  homeLoc: GeoLocation,
  workLoc: GeoLocation | null,
  stations: Station[],
  regionMedianPrice: number,
  fillLitres: number,
  maxDetourKm = ROUTE_CORRIDOR_MAX_DETOUR_KM,
): CorridorStation | null {
  if (!workLoc) return null;

  const baseDistKm = hvKm(homeLoc, workLoc);

  const candidates: CorridorStation[] = [];

  for (const s of stations) {
    if (!s.isOpen || s.price === null) continue;

    const toStation   = hvKm(homeLoc, { lat: s.lat, lng: s.lng });
    const fromStation = hvKm({ lat: s.lat, lng: s.lng }, workLoc);
    const detourKm    = Math.max(0, toStation + fromStation - baseDistKm);

    if (detourKm > maxDetourKm) continue;

    const priceDiff     = regionMedianPrice - s.price; // positive = cheaper
    if (priceDiff <= 0) continue;

    const grossSaving   = priceDiff * fillLitres;
    const detourCost    = detourKm * ROUTE_CORRIDOR_FUEL_COST_BASE;
    const netSavingEur  = grossSaving - detourCost;

    candidates.push({ ...s, detourKm: Math.round(detourKm * 10) / 10, netSavingEur });
  }

  if (candidates.length === 0) return null;

  // Sort by net saving descending
  candidates.sort((a, b) => b.netSavingEur - a.netSavingEur);

  const best = candidates[0];
  console.log(
    `[RouteCorridor] Best on-route station: ${best.brand || best.name} ` +
    `| price=${best.price?.toFixed(3)} | detour=${best.detourKm} km | netSaving=€${best.netSavingEur.toFixed(2)}`
  );

  return best;
}
