// ====================================================
// FuelAmpel — Tab Navigation Layout
// Two tabs: Decide (default) + Stations (browse)
//
// Safe area: uses useSafeAreaInsets().bottom so the tab bar
// sits ABOVE Android's gesture navigation bar / virtual buttons.
// ====================================================

import { Tabs, useRouter } from 'expo-router';
import { Text, View, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUserStore } from '../../src/store/userStore';
import { t } from '../../src/utils/i18n';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      <Text style={[styles.emoji, focused && styles.emojiActive]}>{emoji}</Text>
    </View>
  );
}

function SettingsBtn() {
  const router = useRouter();
  return (
    <TouchableOpacity
      onPress={() => router.push('/settings')}
      style={styles.settingsHeaderBtn}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityLabel={t('openSettingsA11y')}
    >
      <Text style={styles.settingsHeaderIcon}>⚙️</Text>
    </TouchableOpacity>
  );
}

export default function TabLayout() {
  const { bottom } = useSafeAreaInsets();
  // Subscribe to language — triggers re-render when user switches DE↔EN,
  // so tabBarLabel strings returned by t() update immediately.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _lang = useUserStore(s => s.language);

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#0D0F14' },
        headerTintColor: '#F9FAFB',
        headerTitleStyle: { fontWeight: '700', fontSize: 17 },
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: '#111318',
          borderTopColor: 'rgba(255,255,255,0.07)',
          borderTopWidth: 1,
          // Height = visible tab area + safe area bottom inset
          height: 54 + bottom,
          paddingBottom: bottom + 4,
          paddingTop: 4,
        },
        tabBarActiveTintColor: '#6366F1',
        tabBarInactiveTintColor: '#6B7280',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'FuelAmpel',
          tabBarLabel: t('tabDecide'),
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="🚦" focused={focused} />
          ),
          headerRight: () => <SettingsBtn />,
        }}
      />
      <Tabs.Screen
        name="stations"
        options={{
          title: t('tabStations'),
          tabBarLabel: t('tabStations'),
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="⛽" focused={focused} />
          ),
          headerRight: () => <SettingsBtn />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 36,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  iconWrapActive: {
    backgroundColor: 'rgba(99,102,241,0.15)',
  },
  emoji: {
    fontSize: 20,
    opacity: 0.5,
  },
  emojiActive: {
    opacity: 1,
  },
  // Settings button in header right
  settingsHeaderBtn: {
    marginRight: 12,
    padding: 4,
  },
  settingsHeaderIcon: {
    fontSize: 20,
  },
});
