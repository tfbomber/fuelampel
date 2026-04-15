// ====================================================
// FuelAmpel — Fuel API Layer
// Wraps the Tankerkoenig API.
// Set USE_MOCK = true for development / demo key fallback.
//
// API Key: Register at https://creativecommons.tankerkoenig.de
// Demo Key (synthetic data): 00000000-0000-0000-0000-000000000002
// ====================================================

import { Station, FuelType, GeoLocation } from '../utils/types';
import {
  TANKER_API_BASE,
  TANKER_API_KEY,
  TANKER_SEARCH_RADIUS_KM,
} from '../utils/constants';
import { getMockStations } from './mockData';

// Toggle: false = real API, true = mock data for development
const USE_MOCK = false;

// ─── Tankerkoenig API Response Types ─────────────────────────────────────────

interface TankerStation {
  id: string;
  name: string;
  brand: string;
  street: string;
  place: string;
  lat: number;
  lng: number;
  dist: number;
  price?: number;
  e5?: number;
  e10?: number;
  diesel?: number;
  isOpen: boolean;
}

interface TankerListResponse {
  ok: boolean;
  message?: string;
  stations: TankerStation[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractPrice(
  station: TankerStation,
  fuelType: FuelType
): number | null {
  const raw = station[fuelType] ?? station.price;
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'number') return null;  // API returns false when price unavailable
  return raw;
}

function mapToStation(raw: TankerStation, fuelType: FuelType): Station {
  return {
    id: raw.id,
    name: raw.name,
    brand: raw.brand || raw.name,
    street: raw.street,
    place: raw.place,
    lat: raw.lat,
    lng: raw.lng,
    dist: raw.dist,
    // Active display price — the fuelType requested for this fetch
    price:       extractPrice(raw, fuelType),
    // Raw prices for all three types — allows zero-network fuel type switching
    priceE5:     extractPrice(raw, 'e5'),
    priceE10:    extractPrice(raw, 'e10'),
    priceDiesel: extractPrice(raw, 'diesel'),
    isOpen: raw.isOpen,
    fetchedAt: Date.now(),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch nearby stations from Tankerkoenig API (or mock).
 *
 * @param location  User's current coordinates
 * @param fuelType  Fuel type to query
 * @returns Array of Station objects, or empty array on error
 */
export async function fetchNearbyStations(
  location: GeoLocation,
  fuelType: FuelType
): Promise<Station[]> {
  if (USE_MOCK) {
    console.log('[FuelAPI] Using mock data');
    // Simulate network delay
    await new Promise((r) => setTimeout(r, 600));
    return getMockStations();
  }

  const url =
    `${TANKER_API_BASE}/list.php` +
    `?lat=${location.lat}` +
    `&lng=${location.lng}` +
    `&rad=${TANKER_SEARCH_RADIUS_KM}` +
    `&sort=dist` +
    `&type=${fuelType}` +
    `&apikey=${TANKER_API_KEY}`;

  console.log(`[FuelAPI] Fetching stations at (${location.lat}, ${location.lng}) for ${fuelType}`);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`[FuelAPI] HTTP error: ${response.status}`);
      return [];
    }

    const data: TankerListResponse = await response.json();

    if (!data.ok) {
      console.error(`[FuelAPI] API error: ${data.message}`);
      return [];
    }

    const stations = data.stations.map((s) => mapToStation(s, fuelType));
    console.log(`[FuelAPI] Received ${stations.length} stations`);
    return stations;

  } catch (err) {
    console.error('[FuelAPI] Fetch failed:', err);
    return [];
  }
}
