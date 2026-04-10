// ====================================================
// FuelAmpel — useLocationSnapshot Hook  (v2: fixed)
//
// Fix: reads store state via getState() INSIDE the
// callback instead of subscribing as hook dependencies.
// This avoids the infinite re-render caused by object
// selector returning new references on every render.
// ====================================================

import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Location from 'expo-location';
import { useUserStore } from '../store/userStore';
import { haversineKm } from '../core/smartTank';
import {
  SMART_TANK_SNAPSHOT_GAP_MS,
  SMART_TANK_SNAPSHOT_REOPEN_MS,
} from '../utils/constants';

export function useLocationSnapshot() {
  const lastSnapshotMs   = useRef<number>(0);
  const lastForegroundMs = useRef<number>(Date.now());
  const taking           = useRef<boolean>(false);

  // KEY FIX: useCallback with empty deps + read fresh store state INSIDE.
  // This avoids the infinite loop caused by smartTank/commonAreas
  // being object references that change on every store update.
  const trySnapshot = useCallback(async () => {
    // Always read fresh from store — no stale closure, no dependency loop
    const { smartTank, commonAreas, applyLocationSnapshot } =
      useUserStore.getState();

    if (!smartTank) return;
    const home = commonAreas[0];
    if (!home?.loc) return;
    if (taking.current) return;

    const now = Date.now();
    const gapSinceLast = now - lastSnapshotMs.current;

    // Force snapshot if app was closed for >= REOPEN threshold
    const forceByReopen =
      lastSnapshotMs.current > 0 &&
      lastForegroundMs.current - lastSnapshotMs.current >= SMART_TANK_SNAPSHOT_REOPEN_MS;

    if (!forceByReopen && gapSinceLast < SMART_TANK_SNAPSHOT_GAP_MS) {
      return; // Too soon — respect the gap
    }

    try {
      taking.current = true;

      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Low,
      });

      const current = { lat: pos.coords.latitude, lng: pos.coords.longitude };

      const distFromHomeKm = haversineKm(current, home.loc);
      const work = commonAreas[1];
      const distFromWorkKm = work?.loc ? haversineKm(current, work.loc) : null;

      // NO coordinates stored — only distances passed downstream
      applyLocationSnapshot(distFromHomeKm, distFromWorkKm);
      lastSnapshotMs.current = Date.now();

      console.log(
        `[useLocationSnapshot] Snapshot taken: home=${distFromHomeKm.toFixed(1)} km` +
        (distFromWorkKm !== null ? `, work=${distFromWorkKm.toFixed(1)} km` : '')
      );
    } catch (err) {
      console.warn('[useLocationSnapshot] GPS failed:', err);
    } finally {
      taking.current = false;
    }
  }, []); // Empty deps — stable reference, reads fresh state inside

  useEffect(() => {
    trySnapshot(); // On mount / foreground

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        lastForegroundMs.current = Date.now();
        trySnapshot();
      }
    });

    return () => sub.remove();
  }, [trySnapshot]); // trySnapshot is stable → runs once only
}
