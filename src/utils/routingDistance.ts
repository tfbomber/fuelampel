// ====================================================
// FuelAmpel — Road Metrics via OSRM
//
// Uses OpenStreetMap Routing Machine (OSRM) Table API.
// Free, no API key. One batch request: origin → all stations.
//
// Returns both driving DISTANCE (km) and DURATION (minutes).
// Duration is speed-limit based — does NOT include live traffic.
// For real-time traffic, a paid service (e.g. Mapbox) would be needed.
//
// OSRM Table API docs:
//   http://project-osrm.org/docs/v5.24.0/api/#table-service
// ====================================================

import { GeoLocation } from './types';
import { Station } from './types';

const OSRM_BASE   = 'https://router.project-osrm.org/table/v1/driving';
const TIMEOUT_MS  = 7000;

// ─── Correction factor ────────────────────────────────────────────────────────
// OSRM gives actual road-network distances (shortest path).
// A small ×1.05 uplift accounts for Google Maps' preference for faster highways,
// which run slightly longer in km than the shortest path.
const OSRM_DIST_CORRECTION = 1.05;

// ─── Return types ─────────────────────────────────────────────────────────────

export interface RoadMetrics {
  distKm: number;      // road driving distance in km (1 decimal)
  durationMin: number; // estimated drive time in minutes (no live traffic, 0 decimal)
}

/**
 * Fetch road distance AND estimated drive time for all stations.
 * Single OSRM Table API batch request — free, no API key needed.
 *
 * NOTE: Duration is based on OSM speed limits, not real-time traffic.
 *
 * IMPORTANT: OSRM uses lng,lat order (reversed from standard lat,lng).
 *
 * @param origin   User's current location
 * @param stations List of stations
 * @returns        Array of RoadMetrics (same index as stations[]),
 *                 or null if the request failed.
 */
export async function fetchRoadMetrics(
  origin: GeoLocation,
  stations: Station[]
): Promise<RoadMetrics[] | null> {
  if (stations.length === 0) return [];

  // OSRM coordinate format: "lng,lat" (note: reversed!)
  const coords = [
    `${origin.lng.toFixed(6)},${origin.lat.toFixed(6)}`,
    ...stations.map(s => `${s.lng.toFixed(6)},${s.lat.toFixed(6)}`),
  ].join(';');

  // Request both distance (metres) and duration (seconds)
  const url = `${OSRM_BASE}/${coords}?sources=0&annotations=distance,duration`;

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), TIMEOUT_MS);

  console.log(`[OSRM] Requesting road metrics for ${stations.length} stations`);

  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'FuelAmpel/1.0 (private use)' },
    });

    if (!resp.ok) {
      console.warn(`[OSRM] HTTP ${resp.status} — falling back to estimated distances`);
      return null;
    }

    const data = await resp.json();

    if (
      data.code !== 'Ok' ||
      !Array.isArray(data.distances) || !data.distances[0] ||
      !Array.isArray(data.durations) || !data.durations[0]
    ) {
      console.warn('[OSRM] Unexpected response format:', data.code);
      return null;
    }

    // Row 0 = from origin to all destinations; slice(1) skips origin→origin
    const rawDistM: number[] = data.distances[0].slice(1);
    const rawDurS:  number[] = data.durations[0].slice(1);

    const metrics: RoadMetrics[] = rawDistM.map((m, i) => {
      const distKm     = m === null || m === 0
        ? 0
        : parseFloat(((m / 1000) * OSRM_DIST_CORRECTION).toFixed(1));
      const durationMin = rawDurS[i] === null || rawDurS[i] === 0
        ? 0
        : Math.round(rawDurS[i] / 60);
      return { distKm, durationMin };
    });

    console.log(
      `[OSRM] Metrics received — dist (km): ${metrics.map(m => m.distKm).join(', ')} ` +
      `| time (min): ${metrics.map(m => m.durationMin).join(', ')}`
    );

    return metrics;

  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn('[OSRM] Request timed out — falling back to estimates');
    } else {
      console.warn('[OSRM] Fetch error:', err);
    }
    return null;

  } finally {
    clearTimeout(timeoutId);
  }
}
