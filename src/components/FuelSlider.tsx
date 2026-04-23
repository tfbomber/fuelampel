// ====================================================
// FuelAmpel — FuelSlider (custom PanResponder v2)
//
// Replaces @react-native-community/slider with a custom
// bar + draggable emoji thumb. Visually identical to
// ShadowTankBar (10px colored bar) — zero visual jump
// when crossfading between normal and adjusting modes.
//
// 🚗 emoji thumb is draggable via PanResponder.
// Step snapping (default 5%) applied on release.
// ====================================================

import React, { useRef, useState, useEffect } from 'react';
import { View, StyleSheet, Text, Animated, PanResponder } from 'react-native';

const THUMB = 44;       // emoji container diameter (dp)
const TRACK_H = 10;     // matches ShadowTankBar track height
const TRACK_R = 5;      // matches ShadowTankBar border radius

interface Props {
  value: number;              // 0–100
  fillColor: string;
  step?: number;
  onValueChange?: (v: number) => void;
  onSlidingComplete?: (v: number) => void;
  /** Animated.Value driven by dragging — keeps ShadowTankBar fill in sync. */
  animatedFill?: Animated.Value;
}

export function FuelSlider({
  value, fillColor, step = 5,
  onValueChange, onSlidingComplete, animatedFill,
}: Props) {
  const [local, setLocal]             = useState(value);
  const [containerWidth, setWidth]    = useState(1);
  const isDraggingRef                 = useRef(false);
  const localRef                      = useRef(value);

  // ─── Sync with parent value when NOT dragging ─────────────────────────────
  useEffect(() => {
    if (!isDraggingRef.current) {
      setLocal(value);
      localRef.current = value;
    }
  }, [value]);

  // ─── PanResponder — replaces native Slider ────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      // Don't capture on initial touch — let ScrollView handle taps/vertical scrolls
      onStartShouldSetPanResponder: () => false,
      // Only capture when horizontal drag exceeds vertical drag (+ 4px dead-zone)
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > Math.abs(dy) + 4,

      onPanResponderGrant: (_, gestureState) => {
        isDraggingRef.current = true;
        // Calculate initial position from touch
        const touchX = gestureState.x0;
        updateFromTouchX(touchX);
      },

      onPanResponderMove: (_, gestureState) => {
        const touchX = gestureState.moveX;
        updateFromTouchX(touchX);
      },

      onPanResponderRelease: () => {
        isDraggingRef.current = false;
        // Snap to step on release
        const snapped = Math.round(localRef.current / step) * step;
        const clamped = Math.max(0, Math.min(100, snapped));
        setLocal(clamped);
        localRef.current = clamped;
        animatedFill?.setValue(clamped);
        onSlidingComplete?.(clamped);
      },
    })
  ).current;

  // Container layout ref for coordinate conversion
  const containerLayoutRef = useRef({ x: 0, y: 0, width: 1 });

  function updateFromTouchX(absoluteX: number) {
    const layout = containerLayoutRef.current;
    const relativeX = absoluteX - layout.x;
    const pct = Math.max(0, Math.min(100, (relativeX / layout.width) * 100));
    setLocal(pct);
    localRef.current = pct;
    animatedFill?.setValue(pct);
    // Snap the *reported* value to step so parent UI never shows decimals,
    // while keeping internal local/ref at continuous float for smooth thumb.
    const snapped = Math.max(0, Math.min(100, Math.round(pct / step) * step));
    onValueChange?.(snapped);
  }

  // ─── Layout measurement ───────────────────────────────────────────────────
  function handleLayout(e: any) {
    const { width } = e.nativeEvent.layout;
    setWidth(width);
    // Measure absolute position on screen for PanResponder coordinate mapping
    e.target?.measureInWindow?.((x: number, y: number, w: number) => {
      containerLayoutRef.current = { x, y, width: w || width };
    });
    // Fallback: also measure via ref approach
    setTimeout(() => {
      containerRef.current?.measureInWindow?.((x: number, _y: number, w: number) => {
        if (w > 0) containerLayoutRef.current = { x, y: _y, width: w };
      });
    }, 50);
  }

  const containerRef = useRef<View>(null);

  // ─── Emoji thumb position ─────────────────────────────────────────────────
  const rawLeft  = (local / 100) * containerWidth - THUMB / 2;
  const thumbLeft = Math.max(0, Math.min(containerWidth - THUMB, rawLeft));
  const fillWidth = `${Math.max(0, Math.min(100, local))}%` as const;

  return (
    <View
      ref={containerRef}
      style={st.container}
      onLayout={handleLayout}
      {...panResponder.panHandlers}
    >
      {/* Track — visually identical to ShadowTankBar */}
      <View style={st.track}>
        <View style={[st.fill, { width: fillWidth, backgroundColor: fillColor }]} />
      </View>

      {/* 🚗 emoji thumb — draggable */}
      <View
        pointerEvents="none"
        style={[st.thumbBox, { left: thumbLeft }]}
      >
        <Text style={st.thumbEmoji}>🚗</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  container: {
    height: THUMB + 10,
    justifyContent: 'center',
    position: 'relative',
  },
  track: {
    height: TRACK_H,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: TRACK_R,
    overflow: 'hidden',
  },
  fill: {
    height: TRACK_H,
    borderRadius: TRACK_R,
  },
  thumbBox: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    alignItems: 'center',
    justifyContent: 'center',
    top: '50%',
    marginTop: -(THUMB / 2),
    // Subtle glow behind emoji so it reads against any track colour
    backgroundColor: 'rgba(13,15,20,0.55)',
  },
  thumbEmoji: {
    fontSize: 20,
    lineHeight: 26,
  },
});
