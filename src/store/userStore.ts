// ====================================================
// FuelAmpel — User Store (Zustand + AsyncStorage)
// Persists user preferences, onboarding state, shadow tank.
// ====================================================

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  FuelType, GeoLocation, ShadowTankState, SmartTankState,
  RefuelingStyle, CarType, LastRefuelAmount, CommonArea,
  RefuelEvent, DaySnapshot,
} from '../utils/types';
import { Language, setAppLanguage } from '../utils/i18n';
import {
  CAR_TYPE_TANK_CAPACITY,
  CAR_TYPE_AVG_CONSUMPTION,
  DEFAULT_AVG_CONSUMPTION,
  DEFAULT_TANK_CAPACITY,
} from '../utils/constants';
import {
  createDefaultShadowTank,
  resetShadowTank,
  updateConsumption,
} from '../core/shadowTank';
import {
  createDefaultSmartTank,
  recordRefuel as smartRecordRefuel,
  applyDaySnapshot,
  confirmPattern,
  applyManualLevelCorrection,
  migrateFromShadowTank,
  setTotalRangeKm as smartSetTotalRangeKm,
  updateCommuteDistance,
} from '../core/smartTank';
import { fetchRoadMetrics } from '../utils/routingDistance';

// ─── State Shape ──────────────────────────────────────────────────────────────

interface UserState {
  // Language preference
  language: Language;

  // Onboarding gate
  hasCompletedOnboarding: boolean;
  /** True when user explicitly tapped "Überspringen" on step 1/2 — prevents
   *  OnboardingGate from redirecting back to onboarding on next launch. */
  hasSkippedSmartTankSetup: boolean;

  // Preferences (Must — collected in onboarding)
  fuelType: FuelType;
  commonAreas: CommonArea[];      // up to 2 PLZ areas user usually refuels in

  // Preferences (Optional — collected in onboarding or set later)
  refuelingStyle: RefuelingStyle | null;
  carType: CarType | null;
  lastRefuelAmount: LastRefuelAmount | null;

  // Legacy location fields (kept for backward compat with Decide tab)
  homeLocation: GeoLocation | null;
  workLocation: GeoLocation | null;

  // Shadow Tank (legacy — kept for migration)
  shadowTank: ShadowTankState;

  // Smart Shadow Tank v2
  smartTank: SmartTankState | null; // null until initSmartTank is called

  // Notification tracking
  lastNotifiedMs: number;
  /** Non-Critical pushes sent in the current 7-day window. */
  notificationWeekCount: number;
  /** Timestamp when the current weekly window started. */
  notificationWeekStartMs: number;

  // Confirm prompt tracking
  lastPromptedMs: number;

  // ── Actions ──────────────────────────────────────────────────────────────────

  // Onboarding
  skipSmartTankSetup: () => void;
  completeOnboarding: (data: {
    fuelType: FuelType;
    commonAreas: CommonArea[];
    refuelingStyle: RefuelingStyle | null;
    carType: CarType | null;
    lastRefuelAmount: LastRefuelAmount | null;
    initialPct?: number;
  }) => void;

  // Language
  setLanguage: (lang: Language) => void;

  // Individual preference setters (used by Settings)
  setFuelType: (type: FuelType) => void;
  setCommonAreas: (areas: CommonArea[]) => void;
  setRefuelingStyle: (style: RefuelingStyle | null) => void;
  setCarType: (type: CarType | null) => void;
  setLastRefuelAmount: (amount: LastRefuelAmount | null) => void;

  // Legacy location setters
  setHomeLocation: (loc: GeoLocation | null) => void;
  setWorkLocation: (loc: GeoLocation | null) => void;

  // Legacy shadow tank actions (kept for backward compat)
  recordRefuel: (litresFueled?: number) => void;
  setAvgConsumption: (l100km: number) => void;
  setTankCapacity: (litres: number) => void;

  // Smart Tank v2 actions
  initSmartTank: (home?: CommonArea, work?: CommonArea, initialPct?: number) => void;
  recordSmartRefuel: (litresAdded: number, confirmedBy: RefuelEvent['confirmedBy']) => void;
  applyLocationSnapshot: (distFromHomeKm: number, distFromWorkKm: number | null) => void;
  confirmTripPattern: (dayOfWeek: number, confirmed: boolean) => void;
  adjustLevelManually: (newPercent: number) => void;
  recordNavigatedToStation: () => void;
  clearPendingRefuelConfirm: () => void;
  /** Hard-restore SmartTankState to a snapshot saved before a refuel was recorded.
   *  This is the correct Undo path — it removes ghost refuel events from history. */
  restoreSmartTankSnapshot: (snapshot: SmartTankState) => void;

  // Tank range (optional — unlocks km display on TankBar)
  setTotalRangeKm: (rangeKm: number | null) => void;

  // Notification tracking
  recordNotificationSent: (isCritical?: boolean) => void;

  // Confidence / Prompt tracking
  setLastPrompted: () => void;
  confirmCurrentLevel: () => void;

  // Reset actions (Settings)
  resetCommonArea: () => void;
  resetPreferences: () => void;
  fullReset: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      // --- Default values ---
      language: 'de' as Language,
      hasCompletedOnboarding: false,
      hasSkippedSmartTankSetup: false,

      fuelType: 'e5',
      commonAreas: [],
      refuelingStyle: null,
      carType: null,
      lastRefuelAmount: null,

      homeLocation: null,
      workLocation: null,

      shadowTank: createDefaultShadowTank(),
      smartTank: null, // initialized after onboarding or migration
      lastNotifiedMs: 0,
      notificationWeekCount: 0,
      notificationWeekStartMs: Date.now(),
      lastPromptedMs: 0,

      // --- Onboarding ---
      skipSmartTankSetup: () => {
        console.log('[UserStore] SmartTank setup skipped by user');
        set({ hasSkippedSmartTankSetup: true, hasCompletedOnboarding: true });
      },

      completeOnboarding: (data) => {
        console.log('[UserStore] Onboarding completed:', JSON.stringify(data));
        const homeLocFromArea = data.commonAreas[0]?.loc ?? null;
        const home = data.commonAreas[0];
        const work = data.commonAreas[1];

        // --- Dynamic defaults by car type (replaces hardcoded 7.5 / 50) ---
        const carKey = data.carType ?? 'unknown';
        const typedCapacity    = CAR_TYPE_TANK_CAPACITY[carKey]    ?? DEFAULT_TANK_CAPACITY;
        const typedConsumption = CAR_TYPE_AVG_CONSUMPTION[carKey]  ?? DEFAULT_AVG_CONSUMPTION;
        console.log(`[UserStore] Car-type defaults: carType=${carKey}, capacity=${typedCapacity}L, consumption=${typedConsumption}L/100km`);

        // Initialise SmartTank with car-type-aware defaults
        const newSmartTank = createDefaultSmartTank(
          home, work,
          data.initialPct ?? 50,
          typedConsumption,
          typedCapacity,
        );
        set({
          hasCompletedOnboarding: true,
          fuelType: data.fuelType,
          commonAreas: data.commonAreas,
          refuelingStyle: data.refuelingStyle,
          carType: data.carType,
          lastRefuelAmount: data.lastRefuelAmount,
          homeLocation: homeLocFromArea,
          smartTank: newSmartTank,
          // Sync legacy shadowTank with typed defaults too
          shadowTank: { ...get().shadowTank, tankCapacityL: typedCapacity, avgConsumptionPer100km: typedConsumption },
        });

        // Async OSRM road distance refinement
        if (newSmartTank && home?.loc && work?.loc) {
          const dummyStation = { lat: work.loc.lat, lng: work.loc.lng } as any;
          fetchRoadMetrics(home.loc, [dummyStation]).then((metrics) => {
            if (metrics && metrics[0]) {
              const currentSmartTank = get().smartTank;
              if (currentSmartTank) {
                set({ smartTank: updateCommuteDistance(currentSmartTank, metrics[0].distKm) });
              }
            }
          }).catch(err => console.warn('[UserStore] OSRM onboarding fetch failed:', err));
        }
      },

      // --- Language ---
      setLanguage: (lang) => {
        console.log(`[UserStore] Language → ${lang}`);
        setAppLanguage(lang);
        set({ language: lang });
      },

      // --- Individual setters ---
      setFuelType: (type) => {
        console.log(`[UserStore] Fuel type → ${type}`);
        set({ fuelType: type });
      },

      setCommonAreas: (areas) => {
        console.log(`[UserStore] Common areas updated: ${areas.map(a => a.displayName).join(', ')}`);
        const homeLocFromArea = areas[0]?.loc ?? null;
        set({ commonAreas: areas, homeLocation: homeLocFromArea });

        const { smartTank, shadowTank, carType } = get();
        const home = areas[0];
        const work = areas[1];

        if (smartTank) {
          // SmartTank already exists — update commute distance
          if (home?.loc && work?.loc) {
            const dummyStation = { lat: work.loc.lat, lng: work.loc.lng } as any;
            fetchRoadMetrics(home.loc, [dummyStation]).then((metrics) => {
              if (metrics && metrics[0]) {
                const currentSmartTank = get().smartTank;
                if (currentSmartTank) {
                  set({ smartTank: updateCommuteDistance(currentSmartTank, metrics[0].distKm) });
                }
              }
            }).catch(err => console.warn('[UserStore] OSRM settings fetch failed:', err));
          } else {
            // Fallback: Use 0 km for work -> triggers 15km/day default
            set({ smartTank: updateCommuteDistance(smartTank, 0) });
          }
        } else if (home) {
          // ── AUTO-BOOTSTRAP: SmartTank was null (skip-onboarding user) ──
          // Now that the user has provided a home address in Settings,
          // we can finally initialise the SmartTank engine.
          const carKey = carType ?? 'unknown';
          const typedCapacity    = CAR_TYPE_TANK_CAPACITY[carKey]    ?? DEFAULT_TANK_CAPACITY;
          const typedConsumption = CAR_TYPE_AVG_CONSUMPTION[carKey]  ?? DEFAULT_AVG_CONSUMPTION;
          const bootstrapped = createDefaultSmartTank(
            home, work, 50,
            typedConsumption, typedCapacity,
          );
          set({ smartTank: bootstrapped });
          console.log(`[UserStore] SmartTank auto-bootstrapped from Settings: home=${home.displayName}`);

          // Async OSRM refinement for the freshly bootstrapped tank
          if (home.loc && work?.loc) {
            const dummyStation = { lat: work.loc.lat, lng: work.loc.lng } as any;
            fetchRoadMetrics(home.loc, [dummyStation]).then((metrics) => {
              if (metrics && metrics[0]) {
                const currentSmartTank = get().smartTank;
                if (currentSmartTank) {
                  set({ smartTank: updateCommuteDistance(currentSmartTank, metrics[0].distKm) });
                }
              }
            }).catch(err => console.warn('[UserStore] OSRM bootstrap fetch failed:', err));
          }
        }
      },

      setRefuelingStyle: (style) => {
        console.log(`[UserStore] Refueling style → ${style}`);
        set({ refuelingStyle: style });
      },

      setCarType: (type) => {
        console.log(`[UserStore] Car type → ${type}`);
        set({ carType: type });

        // Propagate car-type-aware defaults to tank engines
        if (type) {
          const newCapacity    = CAR_TYPE_TANK_CAPACITY[type]   ?? DEFAULT_TANK_CAPACITY;
          const newConsumption = CAR_TYPE_AVG_CONSUMPTION[type] ?? DEFAULT_AVG_CONSUMPTION;
          set((state) => ({
            shadowTank: {
              ...state.shadowTank,
              tankCapacityL: newCapacity,
              avgConsumptionPer100km: newConsumption,
            },
            smartTank: state.smartTank
              ? { ...state.smartTank, tankCapacityL: newCapacity, consumptionPer100km: newConsumption }
              : state.smartTank,
          }));
          console.log(`[UserStore] Car-type defaults applied: capacity=${newCapacity}L, consumption=${newConsumption}L/100km`);
        }
      },

      setLastRefuelAmount: (amount) => {
        console.log(`[UserStore] Last refuel amount → ${amount}`);
        set({ lastRefuelAmount: amount });
      },

      setHomeLocation: (loc) => {
        console.log('[UserStore] Home location updated');
        set({ homeLocation: loc });
      },

      setWorkLocation: (loc) => {
        console.log('[UserStore] Work location updated');
        set({ workLocation: loc });
      },

      // --- Legacy Shadow Tank (kept for migration) ---
      recordRefuel: (litresFueled) => {
        const currentTank = get().shadowTank;
        const newTank = resetShadowTank(currentTank, litresFueled);
        console.log(`[UserStore] [Legacy] Refuel recorded. New estimated range: ${newTank.kmAtLastRefuel} km`);
        set({ shadowTank: newTank });
      },

      setAvgConsumption: (l100km) => {
        const updated = updateConsumption(get().shadowTank, l100km);
        console.log(`[UserStore] Avg consumption → ${updated.avgConsumptionPer100km} L/100km`);
        set((state) => ({
          shadowTank: updated,
          smartTank: state.smartTank
            ? { ...state.smartTank, consumptionPer100km: l100km }
            : state.smartTank,
        }));
      },

      setTankCapacity: (litres) => {
        const clamped = Math.max(20, Math.min(120, litres));
        console.log(`[UserStore] Tank capacity → ${clamped} L`);
        set((state) => ({
          shadowTank: { ...state.shadowTank, tankCapacityL: clamped },
          // Sync to smart tank as well
          smartTank: state.smartTank
            ? { ...state.smartTank, tankCapacityL: clamped }
            : state.smartTank,
        }));
      },

      // --- Smart Tank v2 actions ---
      initSmartTank: (home, work, initialPct) => {
        const { shadowTank, smartTank } = get();
        if (smartTank) {
          console.log('[UserStore] SmartTank already initialised — skipping init');
          return;
        }
        // Attempt migration from legacy, else fresh start
        const newSmartTank = shadowTank.lastRefuelTimeMs > 0
          ? migrateFromShadowTank(shadowTank, home, work)
          : createDefaultSmartTank(
              home, work, initialPct,
              shadowTank.avgConsumptionPer100km,
              shadowTank.tankCapacityL,
            );
        console.log('[UserStore] SmartTank initialised:', JSON.stringify({ levelPercent: newSmartTank.levelPercent }));
        set({ smartTank: newSmartTank });

        // Async OSRM road distance refinement
        if (home?.loc && work?.loc) {
          const dummyStation = { lat: work.loc.lat, lng: work.loc.lng } as any;
          fetchRoadMetrics(home.loc, [dummyStation]).then((metrics) => {
            if (metrics && metrics[0]) {
              const currentSmartTank = get().smartTank;
              if (currentSmartTank) {
                set({ smartTank: updateCommuteDistance(currentSmartTank, metrics[0].distKm) });
              }
            }
          }).catch(err => console.warn('[UserStore] OSRM init fetch failed:', err));
        }
      },

      recordSmartRefuel: (litresAdded, confirmedBy) => {
        const { smartTank } = get();
        if (!smartTank) return;
        const updated = smartRecordRefuel(smartTank, litresAdded, confirmedBy);
        set({ smartTank: updated });
      },

      applyLocationSnapshot: (distFromHomeKm, distFromWorkKm) => {
        const { smartTank } = get();
        if (!smartTank) return;
        const now = Date.now();
        const date = new Date(now);
        const snapshot: DaySnapshot = {
          dateISO: date.toISOString().slice(0, 10),
          dayOfWeek: date.getDay(),
          timeMs: now,
          distFromHomeKm,
          distFromWorkKm,
          status:
            distFromHomeKm <= 1.5 ? 'HOME' :
            (distFromWorkKm !== null && distFromWorkKm <= 1.5) ? 'WORK' : 'AWAY',
        };
        console.log(`[UserStore] Location snapshot: ${snapshot.status}, distHome=${distFromHomeKm.toFixed(1)} km`);
        set({ smartTank: applyDaySnapshot(smartTank, snapshot) });
      },

      confirmTripPattern: (dayOfWeek, confirmed) => {
        const { smartTank } = get();
        if (!smartTank) return;
        set({ smartTank: confirmPattern(smartTank, dayOfWeek, confirmed) });
      },

      adjustLevelManually: (newPercent) => {
        const { smartTank, commonAreas } = get();
        if (smartTank) {
          // Normal path — SmartTank exists, apply correction directly
          set({ smartTank: applyManualLevelCorrection(smartTank, newPercent) });
          console.log(`[UserStore] Manual level correction: ${Math.round(newPercent)}%`);
        } else {
          // Fix: previously silently dropped the update when smartTank was null,
          // causing the slider to bounce back to the legacy shadowTank estimate (~45%).
          const home = commonAreas[0];
          const work = commonAreas[1];
          if (home) {
            // Auto-init SmartTank from the user's saved area data
            const fresh = createDefaultSmartTank(home, work, Math.round(newPercent));
            set({ smartTank: fresh });
            console.log(`[UserStore] SmartTank auto-initialized at ${Math.round(newPercent)}% via manual adjust`);
          } else {
            // No commonAreas at all (e.g. fully skipped onboarding):
            // Pin shadowTank by resetting the decay timer so the level doesn't drift back.
            set((state) => ({
              shadowTank: {
                ...state.shadowTank,
                kmAtLastRefuel: Math.round(
                  (newPercent / 100)
                  * (state.shadowTank.tankCapacityL / state.shadowTank.avgConsumptionPer100km)
                  * 100
                ),
                lastRefuelTimeMs: Date.now(),
              },
            }));
            console.log(`[UserStore] No SmartTank & no commonAreas — shadowTank pinned at ~${Math.round(newPercent)}%`);
          }
        }
      },

      setLastPrompted: () => {
        set({ lastPromptedMs: Date.now() });
      },

      confirmCurrentLevel: () => {
        const state = get().smartTank;
        if (!state) return;
        set({
          smartTank: {
            ...state,
            lastConfirmedMs: Date.now(),
            confidence: 1.0,
            lastConfirmedBy: 'manual',
          }
        });
        set({ lastPromptedMs: Date.now() });
      },

      recordNavigatedToStation: () => {
        const { smartTank } = get();
        if (!smartTank) return;
        set({
          smartTank: {
            ...smartTank,
            lastNavigatedToStationMs: Date.now(),
            pendingRefuelConfirm: true,
          },
        });
        console.log('[UserStore] Navigation to station recorded — pending refuel confirm');
      },

      clearPendingRefuelConfirm: () => {
        const { smartTank } = get();
        if (!smartTank) return;
        set({ smartTank: { ...smartTank, pendingRefuelConfirm: false } });
      },

      restoreSmartTankSnapshot: (snapshot) => {
        console.log(`[UserStore] SmartTank snapshot restored — level=${snapshot.levelPercent}%, refuelHistory.length=${snapshot.refuelHistory.length}`);
        set({ smartTank: snapshot });
      },

      setTotalRangeKm: (rangeKm) => {
        const state = get();
        const existing = state.smartTank;
        if (!existing) {
          console.warn('[UserStore] setTotalRangeKm called with null SmartTank — auto-bootstrapping');
          const { shadowTank, commonAreas } = state;
          const bootstrapped = createDefaultSmartTank(
            commonAreas[0], commonAreas[1],
            50,
            shadowTank.avgConsumptionPer100km,
            shadowTank.tankCapacityL,
          );
          set({ smartTank: smartSetTotalRangeKm(bootstrapped, rangeKm) });
          return;
        }
        set({ smartTank: smartSetTotalRangeKm(existing, rangeKm) });
      },


      /**
       * Record a push notification was sent.
       * Non-Critical pushes count against the weekly budget.
       * Weekly window resets automatically after 7 days.
       */
      recordNotificationSent: (isCritical = false) => {
        const { notificationWeekCount, notificationWeekStartMs } = get();
        const weekReset = Date.now() - notificationWeekStartMs >= 7 * 24 * 60 * 60 * 1000;
        set({
          lastNotifiedMs: Date.now(),
          notificationWeekCount: isCritical ? notificationWeekCount : (weekReset ? 1 : notificationWeekCount + 1),
          notificationWeekStartMs: weekReset ? Date.now() : notificationWeekStartMs,
        });
        console.log(`[UserStore] Notification sent — isCritical=${isCritical}, weekCount=${isCritical ? notificationWeekCount : (weekReset ? 1 : notificationWeekCount + 1)}`);
      },

      // --- Reset actions ---

      // A: Reset Common Area (PLZs only)
      resetCommonArea: () => {
        console.log('[UserStore] RESET: Common Area cleared');
        set({ commonAreas: [], homeLocation: null });
      },

      // B: Reset Preferences (fuel type + style + car + amount)
      resetPreferences: () => {
        console.log('[UserStore] RESET: Preferences reset to defaults');
        set({
          fuelType: 'e5',
          refuelingStyle: null,
          carType: null,
          lastRefuelAmount: null,
        });
      },

      // C: Full Reset — clears everything, returns to pre-onboarding
      fullReset: () => {
        console.log('[UserStore] FULL RESET: All data cleared');
        set({
          hasCompletedOnboarding: false,
          hasSkippedSmartTankSetup: false,
          fuelType: 'e5',
          commonAreas: [],
          refuelingStyle: null,
          carType: null,
          lastRefuelAmount: null,
          homeLocation: null,
          workLocation: null,
          shadowTank: createDefaultShadowTank(),
          smartTank: null,
          lastNotifiedMs: 0,
          notificationWeekCount: 0,
          notificationWeekStartMs: Date.now(),
          lastPromptedMs: 0,
        });
      },
    }),
    {
      name: 'fuelampel-user-store',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Migration: add confidence field if missing from persisted SmartTank
          if (state.smartTank && (state.smartTank as any).confidence === undefined) {
            state.smartTank.confidence = 0.5;
            console.log('[UserStore] Migration v2: smartTank.confidence initialized to 0.5');
          }
          // Migration: add weekly notification tracking if missing
          if ((state as any).notificationWeekCount === undefined) {
            state.notificationWeekCount = 0;
            state.notificationWeekStartMs = Date.now();
            console.log('[UserStore] Migration v2: notificationWeek fields initialized');
          }
          // Migration: add lastPromptedMs if missing (new field in V1 decision engine)
          if ((state as any).lastPromptedMs === undefined) {
            (state as any).lastPromptedMs = 0;
            console.log('[UserStore] Migration v3: lastPromptedMs initialized to 0');
          }
          // Migration: add language if missing — default to German
          if ((state as any).language === undefined) {
            (state as any).language = 'de';
            console.log('[UserStore] Migration v4: language initialized to de');
          }
          // Sync i18n module with persisted language on boot
          setAppLanguage((state as any).language ?? 'de');
        }
      },
    }
  )
);
