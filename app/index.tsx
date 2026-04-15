// Root index — route based on onboarding + SmartTank init status
//
// Routing logic:
//   1. Brand-new user (never completed onboarding)  → full 5-step guide
//   2. Existing user missing SmartTank (post-update) → smartTankInit only
//   3. Fully configured                              → main tabs
//
// FIX (2026-04-15): Replaced <Redirect> with imperative router.replace() inside
// a useEffect deferred via setTimeout(..., 0). This prevents Expo Router v3 from
// silently dropping the navigation event when it fires during the initial layout
// mount cycle before the root Stack has fully committed its screen registry.
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useUserStore } from '../src/store/userStore';

export default function Root() {
  const router = useRouter();

  const [hydrated, setHydrated] = useState(
    () => useUserStore.persist.hasHydrated()
  );

  // Wait for Zustand to rehydrate from AsyncStorage before routing.
  // Prevents a returning user from briefly flashing to /onboarding
  // because the default value of hasCompletedOnboarding is false.
  useEffect(() => {
    if (!hydrated) {
      // Guard: hydration may already be done before this effect runs
      // (race condition on first install — AsyncStorage returns null instantly)
      if (useUserStore.persist.hasHydrated()) {
        setHydrated(true);
        return;
      }
      const unsub = useUserStore.persist.onFinishHydration(() => {
        setHydrated(true);
      });
      return () => unsub();
    }
  }, [hydrated]);

  // Navigate imperatively once hydration is confirmed.
  // setTimeout(..., 0) defers the call one tick past the current render cycle,
  // ensuring Expo Router's root Stack has fully committed its screen registry
  // before we issue the replace command.
  useEffect(() => {
    if (!hydrated) return;

    const { hasCompletedOnboarding, smartTank } = useUserStore.getState();

    setTimeout(() => {
      if (!hasCompletedOnboarding) {
        // Case 1: Truly new user — must go through full onboarding guide
        console.log('[Root] Routing → /onboarding (new user)');
        router.replace('/onboarding');
      } else if (!smartTank) {
        // Case 2: Existing user who completed onboarding but has no SmartTank data
        //         (e.g. after an app update that introduced SmartTank)
        console.log('[Root] Routing → /onboarding?mode=smartTankInit (existing user, no SmartTank)');
        router.replace('/onboarding?mode=smartTankInit');
      } else {
        // Case 3: Fully configured — go straight to tabs
        console.log('[Root] Routing → /(tabs)');
        router.replace('/(tabs)');
      }
    }, 0);
  }, [hydrated]);

  // Show blank screen while rehydrating — prevents flash to wrong route
  return <View style={{ flex: 1, backgroundColor: '#0D0F14' }} />;
}
