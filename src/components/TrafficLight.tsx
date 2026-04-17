// ====================================================
// FuelAmpel — TrafficLight Component (v2)
//
// Animation changes:
//  - Cross-fade on recommendation change (fade-out → swap → fade-in)
//  - No setValue(0) flash: uses displayRec state to hold content during fade-out
//  - Pulse animation unchanged for Go/Wait
// ====================================================

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
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
    emoji: '💤',
    label: 'SKIP',
    color: '#6B7280',
    glow: 'rgba(107, 114, 128, 0.3)',
    bg: 'rgba(107, 114, 128, 0.08)',
    textColor: '#9CA3AF',
  },
};

export function TrafficLight({ recommendation, size = 160 }: Props) {
  // displayRec: what's currently visible. Lags behind `recommendation`
  // during the fade-out phase so the OLD content fades rather than the new.
  const [displayRec, setDisplayRec] = useState<Recommendation>(recommendation);
  const cfg = CONFIG[displayRec];

  const isMounted = useRef(false);
  const fadeAnim  = useRef(new Animated.Value(1)).current; // start visible
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // ── Cross-fade on recommendation change ───────────────────────────────────
  useEffect(() => {
    // Skip on first mount — already visible
    if (!isMounted.current) {
      isMounted.current = true;
      startPulse(recommendation);
      return;
    }

    // Phase 1: fade out the OLD content (displayRec hasn't changed yet)
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 160,
      useNativeDriver: true,
    }).start(() => {
      // Swap content NOW (React re-renders with new cfg)
      setDisplayRec(recommendation);
      startPulse(recommendation);

      // Phase 2: fade in the NEW content
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }).start();
    });
  }, [recommendation]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pulse loop for Go / Wait ───────────────────────────────────────────────
  function startPulse(rec: Recommendation) {
    // stopAnimation with callback: waits for stop, then resets scale to 1
    // before starting new loop — prevents stuck mid-pulse scale on rec change
    pulseAnim.stopAnimation(() => {
      pulseAnim.setValue(1);
      if (rec !== 'Skip') {
        Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, { toValue: 1.06, duration: 1200, useNativeDriver: true }),
            Animated.timing(pulseAnim, { toValue: 1,    duration: 1200, useNativeDriver: true }),
          ])
        ).start();
      }
    });
  }

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
