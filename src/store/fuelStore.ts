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
import { computeRefuelUrgency } from '../core/smartTank';
import { STATION_CACHE_TTL_MS } from '../utils/constants';
import { useUserStore } from './userStore';
import { fetchRoadMetrics } from '../utils/routingDistance';

// ─── State Shape ──────────────────────────────────────────────────────────────

interface FuelStoreState {
  stations: Station[];
  lastFetchMs: number;
  isLoading: boolean;
  error: string | null;
  decision: DecisionResult | null;
  /** 'road' = OSRM data, 'estimated' = straight-line × 1.3 fallback */
  distanceSource: 'road' | 'estimated';

  // Actions
  refresh: (location: GeoLocation, force?: boolean, fuelTypeOverride?: FuelType) => Promise<void>;
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
  isLoading: false,
  error: null,
  decision: null,
  distanceSource: 'estimated',

  refresh: async (location: GeoLocation, force = false, fuelTypeOverride?: FuelType) => {
    const now = Date.now();
    const { lastFetchMs } = get();

    // Respect rate limit unless forced (e.g. new PLZ location or fuel type change)
    if (!force && now - lastFetchMs < STATION_CACHE_TTL_MS) {
      console.log('[FuelStore] Skipping fetch — cache still valid');
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
      const { smartTank, refuelingStyle } = useUserStore.getState();
      const tankCapacityL = smartTank?.tankCapacityL ?? shadowTank.tankCapacityL ?? 50;
      const confidence   = smartTank?.confidence ?? 0.5;
      const decision = computeDecision(stations, remainingKm, fuelType, location, smartTank, refuelingStyle, tankCapacityL, confidence);


      console.log(
        `[FuelStore] Decision: ${decision.recommendation} | Readiness: ${decision.readiness} | Saving: ${(decision.saving_estimate * 100).toFixed(1)}¢/L | Distance source: ${distanceSource}`
      );

      set({
        stations,
        lastFetchMs: now,
        isLoading: false,
        decision,
        distanceSource,
      });

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[FuelStore] Error during refresh:', msg);
      set({ isLoading: false, error: msg });
    }
  },

  clearError: () => set({ error: null }),

  recomputeDecision: () => {
    const { stations } = get();
    if (stations.length === 0) {
      console.log('[FuelStore] recomputeDecision skipped — no cached stations');
      return;
    }
    const { smartTank, fuelType, refuelingStyle, shadowTank } = useUserStore.getState();
    const tankCapacityL = smartTank?.tankCapacityL ?? shadowTank.tankCapacityL ?? 50;
    const remainingKm  = estimateRemainingKm(shadowTank);
    const confidence   = smartTank?.confidence ?? 0.5;
    const decision = computeDecision(
      stations, remainingKm, fuelType, undefined, smartTank, refuelingStyle, tankCapacityL, confidence
    );
    set({ decision });
    const levelPct = smartTank ? Math.round(computeRefuelUrgency(smartTank).levelPercent) : '?';
    console.log(`[FuelStore] recomputeDecision → ${decision.recommendation} (level=${levelPct}%)`);
    },
    }),
    {
      name: 'fuelampel-fuel-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        stations: state.stations,
        lastFetchMs: state.lastFetchMs,
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
