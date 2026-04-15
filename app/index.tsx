// Root index — intentionally blank.
//
// Routing logic (onboarding gate) has been moved to app/_layout.tsx,
// which is always rendered regardless of which screen Expo Router
// restores or navigates to. This file is only shown for the
// brief moment before _layout.tsx's OnboardingGate fires.
import { View } from 'react-native';

export default function Root() {
  return <View style={{ flex: 1, backgroundColor: '#0D0F14' }} />;
}
