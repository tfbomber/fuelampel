// ====================================================
// FuelAmpel — ShadowTankBar Component  (v2)
//
// Display logic:
//   totalRangeKm set  → right label shows "≈ ZZZ km"
//   totalRangeKm null → right label shows "XX%"
//
// The fill bar accepts an Animated.Value (0–100) so the
// parent can animate it (e.g. after "ich habe getankt").
// ====================================================

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { t } from '../utils/i18n';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring,
} from 'react-native-reanimated';

interface Props {
  fuelLevelPercent: number;
  /** When provided, right label shows "≈ ZZZ km" instead of "XX%". */
  totalRangeKm?: number | null;
  /** When true, shows ~ prefix to indicate estimated (not confirmed) level. */
  isEstimated?: boolean;
  /** When provided, appends fuel type to left label: "⛽ Tank  ·  Diesel" */
  fuelTypeLabel?: string;
  /** When provided, holding the bar triggers this callback (manual level edit). */
  onLongPress?: () => void;
  /** When provided, single tap triggers this callback. */
  onPress?: () => void;
}

function getBarColor(pct: number): string {
  if (pct > 50) return '#22C55E';
  if (pct > 25) return '#F59E0B';
  return '#EF4444';
}

export function ShadowTankBar({ fuelLevelPercent, totalRangeKm, isEstimated, fuelTypeLabel, onLongPress, onPress }: Props) {
  const color = getBarColor(fuelLevelPercent);

  // Right label: km if totalRangeKm is configured, else %
  const rightLabel = (() => {
    const prefix = isEstimated ? '~' : '';
    if (totalRangeKm && totalRangeKm > 0) {
      const km = Math.round((fuelLevelPercent / 100) * totalRangeKm);
      return `${prefix}${Math.round(fuelLevelPercent)}% · ${km} km`;
    }
    return `${prefix}${Math.round(fuelLevelPercent)}%`;
  })();

  // Reanimated smooth width transition
  const fillPct = useSharedValue(fuelLevelPercent);
  useEffect(() => {
    fillPct.value = withSpring(fuelLevelPercent, { damping: 20, stiffness: 120 });
  }, [fuelLevelPercent]);

  const animatedFillStyle = useAnimatedStyle(() => ({
    width: `${fillPct.value}%`,
  }));

  const inner = (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.labelLeft}>
          {isEstimated ? t('tankLabelEst') : t('tankLabel')}{fuelTypeLabel ? `  ·  ${fuelTypeLabel}` : ''}
        </Text>
        <Text style={[styles.labelRight, { color }]}>{rightLabel}</Text>
      </View>
      {/* Fixed-height track zone — matches FuelSlider container (42px) so no layout shift on swap */}
      <View style={styles.trackZone}>
        <View style={styles.track}>
          <Animated.View style={[styles.fill, animatedFillStyle, { backgroundColor: color }]} />
        </View>
      </View>
    </View>
  );

  if (onLongPress || onPress) {
    return (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={250}
        hitSlop={{ top: 16, bottom: 16, left: 0, right: 0 }}
      >
        {inner}
      </Pressable>
    );
  }
  return inner;
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 20,
    marginBottom: 8,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  labelLeft: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '500',
  },
  labelRight: {
    fontSize: 12,
    fontWeight: '700',
  },
  // Fixed height = FuelSlider container (THUMB+10=42) — no layout shift on mode swap
  trackZone: {
    height: 42,
    justifyContent: 'center',
  },
  track: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    borderRadius: 3,
  },
});
