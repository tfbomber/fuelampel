// ====================================================
// FuelAmpel — Fuel Store (Zustand, no persistence)
// Holds fetched station data and API fetch state.
// Not persisted — always fresh on app launch.
// ====================================================

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Station, FuelType, GeoLocation, DecisionResult } from '../utils/types';
import { fetchNearbyStations } from '../data/fuelApi';
import { computeDecision } from '../core/decisionEngine';
import { estimateRemainingKm } from '../core/shadowTank';
import { computeRefuelUrgency, computeConfidence } from '../core/smartTank';
import { STATION_CACHE_TTL_MS } from '../utils/constants';
import { useUserStore } from './userStore';
import { fetchRoadMetrics } from '../utils/routingDistance';
import { findCorridorStation, CorridorStation } from '../utils/routeCorridor';

// ─── State Shape ──────────────────────────────────────────────────────────────

interface FuelStoreState {
  stations: Station[];
  lastFetchMs: number;
  /** Location used in the last successful fetch (rounded to 3 dp for cache-key matching). */
  lastFetchLoc: GeoLocation | null;
  isLoading: boolean;
  error: string | null;
  decision: DecisionResult | null;
  /** Best on-route station between home and work (null if no commute configured). */
  corridorStation: CorridorStation | null;
  /** 'road' = OSRM data, 'estimated' = straight-line × 1.3 fallback */
  distanceSource: 'road' | 'estimated';

  // Actions
  refresh: (location: GeoLocation, force?: boolean, fuelTypeOverride?: FuelType) => Promise<void>;
  /**
   * Re-pick prices for a new fuel type from the cached raw station data.
   * Zero network requests — O(n) in-memory map. Call instead of refresh()
   * when only the fuel type changes and the location hasn't moved.
   */
  switchFuelType: (newType: FuelType) => void;
  /** Re-run decision with cached stations (no network call). Call after user adjusts tank level. */
  recomputeDecision: () => void;
  clearError: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useFuelStore = create<FuelStoreState>()(
  persist(
    (set, get) => ({
      stations: [],
  lastFetchMs: 0,
  lastFetchLoc: null,
  isLoading: false,
  error: null,
  decision: null,
  corridorStation: null,
  distanceSource: 'estimated',

  refresh: async (location: GeoLocation, force = false, fuelTypeOverride?: FuelType) => {
    const now = Date.now();
    const { lastFetchMs, lastFetchLoc } = get();

    // Location match: compare rounded to 3 decimal places (≈ 100 m precision)
    const round3 = (n: number) => Math.round(n * 1000) / 1000;
    const sameLocation =
      lastFetchLoc !== null &&
      round3(lastFetchLoc.lat) === round3(location.lat) &&
      round3(lastFetchLoc.lng) === round3(location.lng);

    // Skip only if: not forced AND TTL still valid AND same location
    if (!force && now - lastFetchMs < STATION_CACHE_TTL_MS && sameLocation) {
      console.log('[FuelStore] Skipping fetch — cache valid for this location');
      return;
    }

    // fuelTypeOverride takes priority over global user setting
    const { fuelType: globalFuelType, shadowTank } = useUserStore.getState();
    const fuelType = fuelTypeOverride ?? globalFuelType;

    console.log(`[FuelStore] Refreshing stations for fuel type: ${fuelType}`);
    set({ isLoading: true, error: null });

    try {
      const stations = await fetchNearbyStations(location, fuelType);

      if (stations.length === 0) {
        console.warn('[FuelStore] No stations returned from API');
      }

      // ── Step 2: Upgrade to real road dist + estimated duration via OSRM ────
      let distanceSource: 'road' | 'estimated' = 'estimated';
      try {
        const metrics = await fetchRoadMetrics(location, stations);
        if (metrics && metrics.length === stations.length) {
          stations.forEach((s, i) => {
            if (metrics[i].distKm > 0) {
              s.dist = metrics[i].distKm;
            }
          });
          distanceSource = 'road';
          console.log('[FuelStore] station.dist updated via OSRM');
        } else {
          // Fallback: straight-line ×1.3, rounded to 1 decimal
          stations.forEach(s => { s.dist = parseFloat((s.dist * 1.3).toFixed(1)); });
          console.warn('[FuelStore] OSRM failed — using ×1.3 estimated distances');
        }
      } catch {
        stations.forEach(s => { s.dist = parseFloat((s.dist * 1.3).toFixed(1)); });
        console.warn('[FuelStore] OSRM exception — using ×1.3 estimated distances');
      }

      // ── Step 3: Compute decision ───────────────────────────────────────────
      const remainingKm = estimateRemainingKm(shadowTank);
      const { smartTank, refuelingStyle, commonAreas } = useUserStore.getState();
      const tankCapacityL = smartTank?.tankCapacityL ?? shadowTank.tankCapacityL ?? 50;
      const confidence   = smartTank ? computeConfidence(smartTank) : 0.5;

      // Step 3a: Find best on-route corridor station (home → work)
      const homeLoc = commonAreas[0]?.loc ?? null;
      const workLoc = commonAreas[1]?.loc ?? null;
      let corridorStation: CorridorStation | null = null;
      if (homeLoc && workLoc) {
        const openPrices = stations.filter(s => s.isOpen && s.price !== null).map(s => s.price as number).sort((a, b) => a - b);
        const medianPrice = openPrices.length > 0
          ? (openPrices.length % 2 !== 0
            ? openPrices[Math.floor(openPrices.length / 2)]
            : (openPrices[Math.floor(openPrices.length / 2) - 1] + openPrices[Math.floor(openPrices.length / 2)]) / 2)
          : 0;
        corridorStation = findCorridorStation(homeLoc, workLoc, stations, medianPrice, tankCapacityL);
      }

      // Step 3b: Compute decision (pass corridor for convenient mode)
      const decision = computeDecision(stations, remainingKm, fuelType, location, smartTank, refuelingStyle, tankCapacityL, confidence, corridorStation);


      console.log(
        `[FuelStore] Decision: ${decision.recommendation} | Readiness: ${decision.readiness} | Saving: ${(decision.saving_estimate * 100).toFixed(1)}¢/L | Distance source: ${distanceSource}${corridorStation ? ` | Corridor: ${corridorStation.brand}` : ''}`
      );

      set({
        stations,
        lastFetchMs: now,
        lastFetchLoc: location,
        isLoading: false,
        decision,
        corridorStation,
        distanceSource,
      });

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[FuelStore] Error during refresh:', msg);
      set({ isLoading: false, error: msg });
    }
  },

  clearError: () => set({ error: null }),

  /**
   * Re-pick the active display price for each station from its cached raw
   * price fields. Zero network requests — completes in < 1 ms regardless
   * of station count.
   */
  switchFuelType: (newType: FuelType) => {
    const { stations } = get();
    if (stations.length === 0) {
      console.log('[FuelStore] switchFuelType skipped — no cached stations');
      return;
    }
    const updated = stations.map(s => ({
      ...s,
      price: newType === 'e5'     ? s.priceE5
           : newType === 'e10'    ? s.priceE10
           : s.priceDiesel,
    }));
    set({ stations: updated });
    // Recompute recommendation with new prices (pure in-memory)
    get().recomputeDecision();
    console.log(`[FuelStore] switchFuelType → ${newType} (${updated.length} stations re-picked)`);
  },

  recomputeDecision: () => {
    const { stations } = get();
    if (stations.length === 0) {
      console.log('[FuelStore] recomputeDecision skipped — no cached stations');
      return;
    }
    const { smartTank, fuelType, refuelingStyle, shadowTank, commonAreas } = useUserStore.getState();
    const tankCapacityL = smartTank?.tankCapacityL ?? shadowTank.tankCapacityL ?? 50;
    const remainingKm  = estimateRemainingKm(shadowTank);
    const confidence   = smartTank ? computeConfidence(smartTank) : 0.5;

    // Recompute corridor
    const homeLoc = commonAreas[0]?.loc ?? null;
    const workLoc = commonAreas[1]?.loc ?? null;
    let corridorStation: CorridorStation | null = null;
    if (homeLoc && workLoc) {
      const openPrices = stations.filter(s => s.isOpen && s.price !== null).map(s => s.price as number).sort((a, b) => a - b);
      const medianPrice = openPrices.length > 0
        ? (openPrices.length % 2 !== 0
          ? openPrices[Math.floor(openPrices.length / 2)]
          : (openPrices[Math.floor(openPrices.length / 2) - 1] + openPrices[Math.floor(openPrices.length / 2)]) / 2)
        : 0;
      corridorStation = findCorridorStation(homeLoc, workLoc, stations, medianPrice, tankCapacityL);
    }

    const decision = computeDecision(
      stations, remainingKm, fuelType, undefined, smartTank, refuelingStyle, tankCapacityL, confidence, corridorStation
    );
    set({ decision, corridorStation });
    const levelPct = smartTank ? Math.round(computeRefuelUrgency(smartTank).levelPercent) : '?';
    console.log(`[FuelStore] recomputeDecision → ${decision.recommendation} (level=${levelPct}%)`);
    },
    }),
    {
      name: 'fuelampel-fuel-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        // stations NOT persisted — real-time price data; schema drift causes switchFuelType to break
        // (old cache lacks priceE5/priceE10/priceDiesel → switchFuelType returns null prices)
        lastFetchMs: state.lastFetchMs,
        lastFetchLoc: state.lastFetchLoc,
        decision: state.decision,
        distanceSource: state.distanceSource,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Reset fetching state flag upon reboot/restoration
          state.isLoading = false;
        }
      },
    }
  )
);
