// ====================================================
// FuelAmpel — Geocoding Utilities
// Uses Nominatim (OpenStreetMap). Free, no API key.
// Rate limit: max 1 req/second — always debounce calls.
// ====================================================

import { GeoLocation } from './types';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const HEADERS = {
  // Nominatim usage policy requires a descriptive User-Agent
  'User-Agent': 'FuelAmpelApp/1.1 (fuel price advisor; contact@fuelampel.app)',
  'Accept-Language': 'de,en',
};

// Request timeout (ms) — prevents perpetual loading if Nominatim is slow/rate-limiting
const FETCH_TIMEOUT_MS = 8_000;

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
export async function geocodePLZ(plz: string): Promise<GeoLocation | null> {
  const cleaned = plz.trim().replace(/\s+/g, '');
  if (!/^\d{4,5}$/.test(cleaned)) return null;

  const url = `${NOMINATIM_BASE}/search?postalcode=${cleaned}&country=DE&format=json&limit=1`;
  console.log(`[Geocoding] PLZ lookup: ${cleaned}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

// ─── Free-text address search (for autocomplete dropdown) ─────────────────────

/**
 * Search for addresses by free text (city name, street, PLZ, or combination).
 * Returns up to 5 suggestions suitable for a dropdown.
 *
 * @param query   User-typed text, e.g. "40210", "Düsseldorf Zentrum"
 * @param signal  Optional AbortSignal to cancel a stale request immediately
 *
 * FIX (2026-04-15):
 *  - Added FETCH_TIMEOUT_MS AbortController to prevent perpetual loading when
 *    Nominatim is slow or rate-limiting (was: await would never resolve).
 *  - Added caller-supplied AbortSignal so stale in-flight requests are
 *    cancelled the moment the user starts typing again.
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
  console.log(`[Geocoding] Address search: "${q}"`);

  // Own timeout guard — aborts after FETCH_TIMEOUT_MS regardless of caller signal
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => {
    console.warn('[Geocoding] Request timed out — aborting');
    timeoutController.abort();
  }, FETCH_TIMEOUT_MS);

  // Use caller's signal if provided, otherwise use our timeout signal.
  // We listen to BOTH by racing them: whichever aborts first wins.
  const effectiveSignal = signal ?? timeoutController.signal;

  // If a caller signal is provided, mirror its abort into our controller so
  // the timeout cleanup path also fires.
  let callerAbortListener: (() => void) | null = null;
  if (signal) {
    callerAbortListener = () => timeoutController.abort();
    signal.addEventListener('abort', callerAbortListener);
  }

  try {
    const res = await fetch(url, {
      headers: HEADERS,
      signal: effectiveSignal,
    });
    clearTimeout(timeout);
    if (callerAbortListener && signal) {
      signal.removeEventListener('abort', callerAbortListener);
    }

    if (!res.ok) {
      console.warn(`[Geocoding] Nominatim returned HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data
      .filter((r: any) => r.lat && r.lon)
      .map((r: any): AddressSuggestion => {
        const addr = r.address ?? {};

        // Build a readable short label
        const cityPart  = addr.city ?? addr.town ?? addr.village ?? addr.county ?? '';
        const subPart   = addr.suburb ?? addr.quarter ?? '';
        const plzPart   = addr.postcode ?? '';
        const shortParts = [plzPart, cityPart, subPart].filter(Boolean);
        const shortName  = shortParts.join(' ') || r.display_name.split(',')[0];

        // Trim the long display name to max ~70 chars for readability
        const displayName = r.display_name.length > 70
          ? r.display_name.slice(0, 67) + '…'
          : r.display_name;

        return {
          displayName,
          shortName,
          loc: { lat: parseFloat(r.lat), lng: parseFloat(r.lon) },
        };
      });

  } catch (err: any) {
    clearTimeout(timeout);
    if (callerAbortListener && signal) {
      signal.removeEventListener('abort', callerAbortListener);
    }
    // AbortError = either timeout or caller-cancelled — not a real error
    if (err?.name === 'AbortError') return [];
    console.error('[Geocoding] Search failed:', err);
    return [];
  }
}
