// ====================================================
// FuelAmpel — Geocoding Utilities
// Uses Nominatim (OpenStreetMap). Free, no API key.
// Rate limit: max 1 req/second — always debounce calls.
// ====================================================

import { GeoLocation } from './types';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const HEADERS = {
  'User-Agent': 'FuelAmpel/1.0 (private use)',
  'Accept-Language': 'de,en',
};

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

  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

// ─── Free-text address search (for autocomplete dropdown) ─────────────────────

/**
 * Search for addresses by free text (city name, street, PLZ, or combination).
 * Returns up to 5 suggestions suitable for a dropdown.
 *
 * @param query  User-typed text, e.g. "40210", "Düsseldorf Zentrum", "Berliner Str 40"
 */
export async function searchAddress(query: string): Promise<AddressSuggestion[]> {
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

  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return [];
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

        // Trim the long display name to max ~60 chars for readability
        const displayName = r.display_name.length > 70
          ? r.display_name.slice(0, 67) + '…'
          : r.display_name;

        return {
          displayName,
          shortName,
          loc: { lat: parseFloat(r.lat), lng: parseFloat(r.lon) },
        };
      });

  } catch (err) {
    console.error('[Geocoding] Search failed:', err);
    return [];
  }
}
