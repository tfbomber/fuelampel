// ====================================================
// FuelAmpel — TrafficLight Component
// The hero visual: Go / Wait / Skip with animation.
// ====================================================

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
} from 'react-native';
import { Recommendation } from '../utils/types';

interface Props {
  recommendation: Recommendation;
  size?: number;
}

const CONFIG: Record<Recommendation, {
  emoji: string;
  label: string;
  color: string;
  glow: string;
  bg: string;
  textColor: string;
}> = {
  Go: {
    emoji: '⛽',
    label: 'GO',
    color: '#22C55E',
    glow: 'rgba(34, 197, 94, 0.4)',
    bg: 'rgba(34, 197, 94, 0.12)',
    textColor: '#22C55E',
  },
  Wait: {
    emoji: '⏳',
    label: 'WAIT',
    color: '#F59E0B',
    glow: 'rgba(245, 158, 11, 0.4)',
    bg: 'rgba(245, 158, 11, 0.12)',
    textColor: '#F59E0B',
  },
  Skip: {
    emoji: '✅',
    label: 'SKIP',
    color: '#6B7280',
    glow: 'rgba(107, 114, 128, 0.3)',
    bg: 'rgba(107, 114, 128, 0.08)',
    textColor: '#9CA3AF',
  },
};

export function TrafficLight({ recommendation, size = 160 }: Props) {
  const cfg = CONFIG[recommendation];
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fade in on mount / recommendation change
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();

    // Pulse only for Go and Wait
    if (recommendation !== 'Skip') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.06,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [recommendation]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{ scale: pulseAnim }],
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: cfg.bg,
          borderColor: cfg.color,
          shadowColor: cfg.glow,
        },
      ]}
    >
      <Text style={[styles.emoji, { fontSize: size * 0.3 }]}>{cfg.emoji}</Text>
      <Text style={[styles.label, { color: cfg.textColor, fontSize: size * 0.22 }]}>
        {cfg.label}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 12,
  },
  emoji: {
    marginBottom: 2,
  },
  label: {
    fontWeight: '800',
    letterSpacing: 3,
  },
});
