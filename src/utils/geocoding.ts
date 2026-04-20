// ====================================================
// FuelAmpel — Geocoding Utilities
// Uses Nominatim (OpenStreetMap) as Plan A,
// Photon (Komoot) as Plan B fallback.
// Neither requires an API key.
// ====================================================

import { GeoLocation } from './types';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const PHOTON_BASE    = 'https://photon.komoot.io/api';

const NOMINATIM_HEADERS = {
  // Nominatim usage policy requires a descriptive User-Agent
  'User-Agent': 'FuelAmpelApp/1.1 (fuel price advisor; contact@fuelampel.app)',
  'Accept-Language': 'de,en',
};

/** Hard request timeout (ms) for individual fetch calls. */
const FETCH_TIMEOUT_MS = 8_000;

/** Aggressive timeout (ms) for each leg of the cascade (Plan A / Plan B). */
const CASCADE_LEG_TIMEOUT_MS = 3_000;

// ─── Address result ───────────────────────────────────────────────────────────

export interface AddressSuggestion {
  /** Full human-readable address for display */
  displayName: string;
  /** Short label (city + suburb or PLZ) shown in the input after selection */
  shortName: string;
  loc: GeoLocation;
}

// ─── PLZ-only lookup ──────────────────────────────────────────────────────────

/**
 * Geocode a German PLZ (Postleitzahl) to coordinates.
 * @param plz  5-digit German postal code
 */
export async function geocodePLZ(
  plz: string,
  callerSignal?: AbortSignal,
): Promise<GeoLocation | null> {
  const cleaned = plz.trim().replace(/\s+/g, '');
  if (!/^\d{4,5}$/.test(cleaned)) return null;

  const url = `${NOMINATIM_BASE}/search?postalcode=${cleaned}&country=DE&format=json&limit=1`;
  console.log(`[Geocoding] PLZ lookup: ${cleaned}`);

  // Own timeout — aborts after FETCH_TIMEOUT_MS regardless of caller signal
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), FETCH_TIMEOUT_MS);

  // Mirror caller abort into timeout controller (same pattern as searchAddress)
  let callerListener: (() => void) | null = null;
  if (callerSignal) {
    callerListener = () => timeoutController.abort();
    callerSignal.addEventListener('abort', callerListener);
  }

  try {
    const res = await fetch(url, { headers: NOMINATIM_HEADERS, signal: timeoutController.signal });
    clearTimeout(timeout);
    if (callerListener && callerSignal) callerSignal.removeEventListener('abort', callerListener);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    clearTimeout(timeout);
    if (callerListener && callerSignal) callerSignal.removeEventListener('abort', callerListener);
    return null;
  }
}

// ─── Internal: Nominatim search ───────────────────────────────────────────────

/**
 * Search via Nominatim (Plan A).
 * @param signal  AbortSignal — combine your own timeout with the caller's cancel signal.
 */
export async function searchAddress(
  query: string,
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const params = new URLSearchParams({
    q,
    format: 'json',
    limit: '6',
    countrycodes: 'de',
    addressdetails: '1',
  });

  const url = `${NOMINATIM_BASE}/search?${params.toString()}`;
  console.log(`[Geocoding:Nominatim] Searching: "${q}"`);

  // Own timeout — aborts after FETCH_TIMEOUT_MS regardless of caller signal
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => {
    console.warn('[Geocoding:Nominatim] Request timed out');
    timeoutController.abort();
  }, FETCH_TIMEOUT_MS);

  // Mirror caller abort into our timeout controller for cleanup
  const effectiveSignal = signal ?? timeoutController.signal;
  let callerAbortListener: (() => void) | null = null;
  if (signal) {
    callerAbortListener = () => timeoutController.abort();
    signal.addEventListener('abort', callerAbortListener);
  }

  try {
    const res = await fetch(url, { headers: NOMINATIM_HEADERS, signal: effectiveSignal });
    clearTimeout(timeout);
    if (callerAbortListener && signal) signal.removeEventListener('abort', callerAbortListener);

    if (!res.ok) {
      console.warn(`[Geocoding:Nominatim] HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data
      .filter((r: any) => r.lat && r.lon)
      .map((r: any): AddressSuggestion => {
        const addr = r.address ?? {};
        const cityPart  = addr.city ?? addr.town ?? addr.village ?? addr.county ?? '';
        const subPart   = addr.suburb ?? addr.quarter ?? '';
        const plzPart   = addr.postcode ?? '';
        const roadPart  = addr.road ?? addr.pedestrian ?? addr.path ?? '';
        // Street-first: show 'Am Muehlengweg, Neuss' not '41470 Neuss'
        const shortName = roadPart
          ? [roadPart, cityPart].filter(Boolean).join(', ')
          : ([plzPart, cityPart, subPart].filter(Boolean).join(' ') || r.display_name.split(',')[0]);
        const displayName = r.display_name.length > 70
          ? r.display_name.slice(0, 67) + '...'
          : r.display_name;
                return { displayName, shortName, loc: { lat: parseFloat(r.lat), lng: parseFloat(r.lon) } };
      });

  } catch (err: any) {
    clearTimeout(timeout);
    if (callerAbortListener && signal) signal.removeEventListener('abort', callerAbortListener);
    if (err?.name === 'AbortError') return [];
    console.error('[Geocoding:Nominatim] Search failed:', err);
    return [];
  }
}

// ─── Internal: Photon search (Plan B) ─────────────────────────────────────────

/**
 * Search via Photon by Komoot — faster, higher concurrency than Nominatim.
 * No API key required. Fair-use policy similar to Nominatim.
 * Germany bounding box applied to keep results relevant.
 */
async function searchAddressPhoton(
  query: string,
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  // bbox: minLon,minLat,maxLon,maxLat (Germany)
  const params = new URLSearchParams({
    q,
    limit: '6',
    lang: 'de',
    bbox: '5.87,47.27,15.04,55.06',
  });

  const url = `${PHOTON_BASE}/?${params.toString()}`;
  console.log(`[Geocoding:Photon] Searching: "${q}"`);

  const timeoutController = new AbortController();
  const timeout = setTimeout(() => {
    console.warn('[Geocoding:Photon] Request timed out');
    timeoutController.abort();
  }, FETCH_TIMEOUT_MS);

  const effectiveSignal = signal ?? timeoutController.signal;
  let callerAbortListener: (() => void) | null = null;
  if (signal) {
    callerAbortListener = () => timeoutController.abort();
    signal.addEventListener('abort', callerAbortListener);
  }

  try {
    const res = await fetch(url, { signal: effectiveSignal });
    clearTimeout(timeout);
    if (callerAbortListener && signal) signal.removeEventListener('abort', callerAbortListener);

    if (!res.ok) {
      console.warn(`[Geocoding:Photon] HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    if (!data?.features || !Array.isArray(data.features)) return [];

    return data.features
      .filter((f: any) => f.geometry?.coordinates?.length === 2)
      .map((f: any): AddressSuggestion => {
        const p = f.properties ?? {};
        const cityPart = p.city ?? p.county ?? p.state ?? '';
        const subPart  = p.suburb ?? p.district ?? '';
        const plzPart  = p.postcode ?? '';
        const streetPart = p.street ?? p.name ?? '';
        // Street-first: show 'Am Muehlengweg, Neuss' not '41470 Neuss'
        const shortName = streetPart
          ? [streetPart, cityPart].filter(Boolean).join(', ')
          : ([plzPart, cityPart, subPart].filter(Boolean).join(' ') || p.name || q);
                const displayParts = [p.name, p.street, plzPart, cityPart].filter(Boolean);
        const displayName  = displayParts.join(', ').slice(0, 70);
        return {
          displayName: displayName || shortName,
          shortName,
          loc: { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] },
        };
      });

  } catch (err: any) {
    clearTimeout(timeout);
    if (callerAbortListener && signal) signal.removeEventListener('abort', callerAbortListener);
    if (err?.name === 'AbortError') return [];
    console.error('[Geocoding:Photon] Search failed:', err);
    return [];
  }
}

// ─── Public: Cascade search (Plan A → Plan B) ─────────────────────────────────

/**
 * Resilient address search with automatic fallback cascade:
 *   Plan A: Nominatim   — 3 s timeout
 *   Plan B: Photon      — 3 s timeout (triggered if Plan A returns nothing)
 *   Total max wait:  ~6 s before returning { failed: true }
 *
 * Each leg is individually aborted if it exceeds CASCADE_LEG_TIMEOUT_MS,
 * so the user never waits more than 6 s.  callerSignal lets the UI cancel
 * both legs immediately when the user starts typing again.
 *
 * @returns { results, usedFallback, failed }
 */
export async function searchAddressWithFallback(
  query: string,
  callerSignal?: AbortSignal,
): Promise<{ results: AddressSuggestion[]; usedFallback: boolean; failed: boolean }> {

  // ── Plan A: Nominatim (3 s) ─────────────────────────────────────────────
  const planAAc = new AbortController();
  const planATimer = setTimeout(() => planAAc.abort(), CASCADE_LEG_TIMEOUT_MS);
  let planAResults: AddressSuggestion[] = [];
  let planAFailed = false;
  try {
    planAResults = await searchAddress(query, planAAc.signal);
    clearTimeout(planATimer);
    if (planAResults.length > 0) {
      return { results: planAResults, usedFallback: false, failed: false };
    }
    planAFailed = true; // returned but empty — try Plan B
    console.log('[Geocoding] Plan A empty — escalating to Photon');
  } catch {
    clearTimeout(planATimer);
    planAFailed = true;
    console.warn('[Geocoding] Plan A threw — escalating to Photon');
  }

  // Bail if caller cancelled during Plan A
  if (callerSignal?.aborted) return { results: [], usedFallback: false, failed: true };

  // ── Plan B: Photon (3 s) ────────────────────────────────────────────────
  const planBAc = new AbortController();
  const planBTimer = setTimeout(() => planBAc.abort(), CASCADE_LEG_TIMEOUT_MS);
  try {
    const photonResults = await searchAddressPhoton(query, planBAc.signal);
    clearTimeout(planBTimer);
    if (!callerSignal?.aborted && photonResults.length > 0) {
      return { results: photonResults, usedFallback: true, failed: false };
    }
  } catch {
    clearTimeout(planBTimer);
  }

  console.warn('[Geocoding] Both Plan A and Plan B failed for query:', query);
  return { results: [], usedFallback: false, failed: true };
}
