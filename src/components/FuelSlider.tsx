// ====================================================
// FuelAmpel — FuelSlider (native platform Slider)
//
// PROPER SOLUTION (2026-04-15 v1.1.7):
// Replaced hand-rolled PanResponder implementation with
// @react-native-community/slider — a native platform SeekBar
// on Android and UISlider on iOS.
//
// All previous PanResponder / locationX / measure() code has
// been deleted. Coordinate system bugs inside Animated.View
// on Android are a platform-level limitation that cannot be
// patched in JS. The native slider is the only correct solution.
//
// 🚗 emoji is a purely visual overlay layer (pointerEvents="none")
// positioned by the current value %; it never participates in
// touch handling — the native Slider handles all gestures.
// ====================================================

import React, { useRef, useState, useEffect } from 'react';
import { View, StyleSheet, Text, Animated } from 'react-native';
import Slider from '@react-native-community/slider';

const THUMB = 32;  // emoji container diameter (dp)

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

  // ─── Sync with parent value when NOT dragging ─────────────────────────────
  // Parent passes `sliderValue` which is set by handleManualAdjust to fuelPct.
  // Guard needed so that onValueChange callback doesn't trigger a reset loop.
  useEffect(() => {
    if (!isDraggingRef.current) {
      setLocal(value);
    }
  }, [value]);

  // ─── Step snapping ────────────────────────────────────────────────────────
  // Native Slider uses step=1 for smooth dragging; we snap in our callbacks
  // to honour the desired step interval (default: 5%).
  const snap = (v: number): number => Math.round(v / step) * step;

  // ─── Callbacks ────────────────────────────────────────────────────────────

  const handleValueChange = (v: number) => {
    isDraggingRef.current = true;
    const s = snap(v);
    setLocal(s);
    animatedFill?.setValue(s);
    onValueChange?.(s);
  };

  const handleSlidingComplete = (v: number) => {
    const s = snap(v);
    setLocal(s);
    animatedFill?.setValue(s);
    isDraggingRef.current = false;
    onSlidingComplete?.(s);
  };

  // ─── Emoji thumb position (visual only) ──────────────────────────────────
  // Positioned using containerWidth captured via onLayout.
  // At 0% → left ≈ -THUMB/2 (clipped by container overflow:hidden is off, so
  // we clamp to max(0, ...) to keep it fully visible).
  const rawLeft  = (local / 100) * containerWidth - THUMB / 2;
  const thumbLeft = Math.max(0, Math.min(containerWidth - THUMB, rawLeft));

  return (
    <View
      style={st.container}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {/*
        Native platform Slider — SeekBar (Android) / UISlider (iOS).
        Handles ALL touch & gesture recognition at the platform level.
        No JavaScript coordinate math involved — zero coordinate bugs.

        thumbTintColor="transparent" hides the native thumb visually;
        the 🚗 emoji below serves as the visible thumb indicator.
        The native touch target still covers the full track width,
        so the user can tap anywhere on the track to set the value.
      */}
      <Slider
        style={st.nativeSlider}
        minimumValue={0}
        maximumValue={100}
        step={1}
        value={local}
        onValueChange={handleValueChange}
        onSlidingComplete={handleSlidingComplete}
        minimumTrackTintColor={fillColor}
        maximumTrackTintColor="rgba(255,255,255,0.10)"
        thumbTintColor="transparent"
      />

      {/* 🚗 emoji — purely decorative, intercepts no touches */}
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
  nativeSlider: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: THUMB + 10,
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
