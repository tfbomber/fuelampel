// ====================================================
// FuelAmpel — useDecision Hook  (v2)
//
// Two-phase location strategy for fast initial load:
//   Phase 1: getLastKnownPositionAsync()  → instant, triggers fetch immediately
//   Phase 2: getCurrentPositionAsync()    → accurate fix, silently re-fetches
//
// Falls back to homeLocation if GPS is denied or unavailable.
// ====================================================

import { useEffect, useCallback, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { useFuelStore } from '../store/fuelStore';
import { useUserStore } from '../store/userStore';
import { GeoLocation } from '../utils/types';

/** How long to wait (ms) for a precise GPS fix before giving up. */
const GPS_TIMEOUT_MS = 6000;

export function useDecision() {
  const { refresh, isLoading, error, decision, stations } = useFuelStore();
  const { homeLocation } = useUserStore();
  const hasRequestedPermission = useRef(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  /**
   * Request location permission once.
   * Returns true if granted.
   */
  const ensurePermission = useCallback(async (): Promise<boolean> => {
    const { status: existingStatus, canAskAgain } = await Location.getForegroundPermissionsAsync();
    if (existingStatus === 'granted') {
      setPermissionDenied(false);
      return true;
    }

    if (canAskAgain && !hasRequestedPermission.current) {
      hasRequestedPermission.current = true;
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setPermissionDenied(false);
        return true;
      }
    }

    console.warn('[useDecision] Location permission conditionally or permanently denied');
    setPermissionDenied(true);
    return false;
  }, []);

  /**
   * Phase 1: return the last known position immediately (< 50 ms).
   * Returns null if unavailable.
   */
  const getLastKnown = useCallback(async (): Promise<GeoLocation | null> => {
    try {
      const pos = await Location.getLastKnownPositionAsync();
      if (!pos) return null;
      console.log('[useDecision] Phase 1 — using last known position');
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch {
      return null;
    }
  }, []);

  /**
   * Phase 2: get a fresh accurate fix with a hard timeout.
   * Returns null if it times out or fails.
   */
  const getFreshFix = useCallback(async (): Promise<GeoLocation | null> => {
    try {
      const pos = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), GPS_TIMEOUT_MS)),
      ]);
      if (!pos) {
        console.warn('[useDecision] Phase 2 — GPS timed out after', GPS_TIMEOUT_MS, 'ms');
        return null;
      }
      console.log('[useDecision] Phase 2 — fresh GPS fix obtained');
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch (err) {
      console.warn('[useDecision] Phase 2 — GPS failed:', err);
      return null;
    }
  }, []);

  /**
   * Main refresh — two-phase strategy:
   *   1. Fetch immediately with last-known / homeLocation (fast UI).
   *   2. Re-fetch silently with fresh GPS fix (accurate data).
   */
  const triggerRefresh = useCallback(async () => {
    console.log('[useDecision] Triggering refresh...');
    const granted = await ensurePermission();

    // Phase 1: instant fetch with whatever location we have
    const fast = granted ? await getLastKnown() : null;
    const startLoc = fast ?? homeLocation ?? null;

    if (startLoc) {
      console.log('[useDecision] Phase 1 — fetching with fast location');
      await refresh(startLoc);
    } else {
      console.warn('[useDecision] No location for Phase 1 — waiting for GPS');
    }

    // Phase 2: silent accurate refresh (only if permission granted)
    if (granted) {
      const precise = await getFreshFix();
      if (precise) {
        console.log('[useDecision] Phase 2 — re-fetching with precise GPS');
        await refresh(precise);
      } else if (!startLoc) {
        // Phase 1 had no location either, try homeLocation as final fallback
        const fallback = homeLocation ?? null;
        if (fallback) {
          console.log('[useDecision] Final fallback — homeLocation');
          await refresh(fallback);
        } else {
          console.warn('[useDecision] No location available at all.');
        }
      }
    }
  }, [ensurePermission, getLastKnown, getFreshFix, homeLocation, refresh]);

  // Auto-refresh on mount
  useEffect(() => {
    triggerRefresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    decision,
    stations,
    isLoading,
    error,
    permissionDenied,
    refresh: triggerRefresh,
  };
}
