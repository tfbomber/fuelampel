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

import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useLocationSnapshot } from '../src/hooks/useLocationSnapshot';
import { useDailyCheckScheduler } from '../src/hooks/useDailyCheckScheduler';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useEffect, useState } from 'react';
import { useUserStore } from '../src/store/userStore';

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
// Runs on every layout render. Once hydrated, redirects to the correct screen.
// Uses segments to avoid redirect loops when already on the right screen.
function OnboardingGate() {
  const router   = useRouter();
  const segments = useSegments();

  // Track Zustand hydration state
  const [hydrated, setHydrated] = useState(
    () => useUserStore.persist.hasHydrated()
  );

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

  useEffect(() => {
    if (!hydrated) return;

    // Already on the onboarding screen — don't redirect, let onboarding drive navigation
    const inOnboarding = segments[0] === 'onboarding';
    if (inOnboarding) return;

    const { hasCompletedOnboarding, smartTank } = useUserStore.getState();

    // Defer one tick so Expo Router's root Stack has committed its screen registry
    setTimeout(() => {
      if (!hasCompletedOnboarding) {
        console.log('[OnboardingGate] → /onboarding (new / reset user)');
        router.replace('/onboarding');
      } else if (!smartTank) {
        console.log('[OnboardingGate] → /onboarding?mode=smartTankInit (no SmartTank)');
        router.replace('/onboarding?mode=smartTankInit');
      }
      // else: fully configured — stay on current (tabs) screen
    }, 0);
  }, [hydrated, segments]);

  return null; // purely logic, no UI
}

export default function RootLayout() {
  // Silently takes location snapshots (foreground only, 3h gap-gated)
  useLocationSnapshot();
  // Pre-schedules 16:00 daily check notification whenever SmartTank changes
  useDailyCheckScheduler();

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {/* Onboarding gate runs silently alongside the Stack */}
      <OnboardingGate />
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
            title: 'Settings',
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
