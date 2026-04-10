// Root index — route based on onboarding + SmartTank init status
//
// Routing logic:
//   1. Brand-new user (never completed onboarding)  → full 5-step guide
//   2. Existing user missing SmartTank (post-update) → smartTankInit only
//   3. Fully configured                              → main tabs
//
// IMPORTANT: We must wait for Zustand to rehydrate from AsyncStorage before
// routing, otherwise a returning user will briefly flash to /onboarding
// because the default value of hasCompletedOnboarding is false.
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { useUserStore } from '../src/store/userStore';

export default function Root() {
  const [hydrated, setHydrated] = useState(
    () => useUserStore.persist.hasHydrated()
  );

  useEffect(() => {
    if (!hydrated) {
      const unsub = useUserStore.persist.onFinishHydration(() => {
        setHydrated(true);
      });
      return () => unsub();
    }
  }, [hydrated]);

  const hasCompletedOnboarding = useUserStore(s => s.hasCompletedOnboarding);
  const smartTank              = useUserStore(s => s.smartTank);

  // Show blank screen while rehydrating — prevents flash to wrong route
  if (!hydrated) {
    return <View style={{ flex: 1, backgroundColor: '#0D0F14' }} />;
  }

  // Case 1: Truly new user — must go through full onboarding guide
  if (!hasCompletedOnboarding) {
    return <Redirect href="/onboarding" />;
  }

  // Case 2: Existing user who completed onboarding but has no SmartTank data
  //         (e.g. after an app update that introduced SmartTank)
  if (!smartTank) {
    return <Redirect href="/onboarding?mode=smartTankInit" />;
  }

  return <Redirect href="/(tabs)" />;
}
