// ====================================================
// FuelAmpel — Root Stack Layout
// Wraps tabs + settings modal in a single Stack.
//
// ONBOARDING GATE (2026-04-15):
// The routing gate MUST live here, not in index.tsx.
// Expo Router restores the last active route on re-launch,
// which means app/index.tsx is bypassed entirely for
// returning users. _layout.tsx is ALWAYS rendered,
// making it the only reliable place for a routing gate.
// ====================================================

import 'react-native-reanimated';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useLocationSnapshot } from '../src/hooks/useLocationSnapshot';
import { useDailyCheckScheduler } from '../src/hooks/useDailyCheckScheduler';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useEffect, useState } from 'react';
import { useUserStore } from '../src/store/userStore';
import { t } from '../src/utils/i18n';
import { ensureNotificationPermission } from '../src/utils/notificationPermission';
import { cancelDailyCheck } from '../src/core/dailyCheck';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('default', {
    name: 'default',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF231F7C',
  });
}

// ── Onboarding Gate ───────────────────────────────────────────────────────────
// Runs inside the root layout on every render cycle.
// By the time OnboardingGate mounts, RootLayout has already confirmed hydration
// (it blocks rendering until hydrated=true). No subscription needed here.
function OnboardingGate() {
  const router   = useRouter();
  const segments = useSegments();

  useEffect(() => {
    // Silent check/request for existing users who skip onboarding
    ensureNotificationPermission().catch((err) => console.warn(err));

    // Already on onboarding — let onboarding drive its own navigation
    const inOnboarding = segments[0] === 'onboarding';
    if (inOnboarding) return;

    const { hasCompletedOnboarding } = useUserStore.getState();

    // setTimeout(fn, 0) defers one JS tick so Stack navigation state is committed.
    setTimeout(() => {
      if (!hasCompletedOnboarding && !inOnboarding) {
        console.log('[OnboardingGate] → /onboarding (new / reset user)');
        router.replace('/onboarding');
      }
      SplashScreen.hideAsync();
    }, 0);
  }, [segments]); // eslint-disable-line react-hooks/exhaustive-deps

  return null; // purely logic, no UI
}


function SmartTankenBackground() {
  const isEnabled = useUserStore((s) => s.isSmartTankenEnabled);

  useEffect(() => {
    // If disabled, explicitly cancel any existing scheduled daily checks
    if (!isEnabled) {
      cancelDailyCheck();
    }
  }, [isEnabled]);

  if (!isEnabled) return null;

  return <SmartTankenBackgroundActive />;
}

function SmartTankenBackgroundActive() {
  // Silently takes location snapshots (foreground only, 3h gap-gated)
  useLocationSnapshot();
  // Pre-schedules 11:30 daily check notification whenever SmartTank changes
  useDailyCheckScheduler();
  return null;
}

export default function RootLayout() {
  const _lang = useUserStore(s => s.language);
  
  const [hydrated, setHydrated] = useState(() => useUserStore.persist.hasHydrated());
  useEffect(() => {
    if (!hydrated) {
      if (useUserStore.persist.hasHydrated()) {
        setHydrated(true);
        return;
      }
      const unsub = useUserStore.persist.onFinishHydration(() => setHydrated(true));
      return () => unsub();
    }
  }, [hydrated]);

  if (!hydrated) {
    return <View style={styles.root} />;
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {/* Onboarding gate runs silently alongside the Stack */}
      <OnboardingGate />
      <SmartTankenBackground />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0D0F14' },
          headerTintColor: '#F9FAFB',
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: '#0D0F14' },
          headerShadowVisible: false,
        }}
      >
        {/* Tab group — no top header (tabs have their own header) */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

        {/* Onboarding — full-screen, no header, no back gesture */}
        <Stack.Screen
          name="onboarding"
          options={{
            headerShown: false,
            gestureEnabled: false,   // prevent swipe-back to bypass onboarding
          }}
        />

        {/* Settings is a full Stack page pushed on top of tabs */}
        <Stack.Screen
          name="settings"
          options={{
            title: t('settingsTitle'),
            presentation: 'card',
          }}
        />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0D0F14',
  },
});

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <View style={[styles.root, { justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
      <Text style={{ fontSize: 48, marginBottom: 16 }}>💥</Text>
      <Text style={{ color: '#EF4444', fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' }}>
        Ein Fehler ist aufgetreten
      </Text>
      <Text style={{ color: '#6B7280', fontSize: 13, textAlign: 'center', marginBottom: 32 }}>
        {error.message}
      </Text>
      <TouchableOpacity
        style={{
          backgroundColor: 'rgba(99,102,241,0.15)',
          borderWidth: 1,
          borderColor: 'rgba(99,102,241,0.4)',
          borderRadius: 24,
          paddingHorizontal: 24,
          paddingVertical: 12,
        }}
        onPress={retry}
      >
        <Text style={{ color: '#A5B4FC', fontSize: 14, fontWeight: '600' }}>App neu laden</Text>
      </TouchableOpacity>
    </View>
  );
}
