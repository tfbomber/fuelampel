// Root index — route based on onboarding + SmartTank init status
//
// Routing logic:
//   1. Brand-new user (never completed onboarding)  → full 5-step guide
//   2. Existing user missing SmartTank (post-update) → smartTankInit only
//   3. Fully configured                              → main tabs
import { Redirect } from 'expo-router';
import { useUserStore } from '../src/store/userStore';

export default function Root() {
  const hasCompletedOnboarding = useUserStore(s => s.hasCompletedOnboarding);
  const smartTank              = useUserStore(s => s.smartTank);

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
