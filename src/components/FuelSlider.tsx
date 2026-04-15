// ====================================================
// FuelAmpel — FuelSlider  (custom PanResponder slider)
//
// Thumb: 🚗 emoji — fun, thematic, instantly clear
// Fill:  colored track (green/amber/red) matching level
// Supports external Animated.Value for fill animation
//
// FIX (2026-04-15): Removed fragile measure()/pageX absolute-coordinate
// approach which caused Android to miscalculate touch position by the
// screen's horizontal margin (rendering ~45% for any central touch).
// Now uses:
//   - e.nativeEvent.locationX on grant (reliable relative-to-container coord)
//   - gestureState.dx for drag delta (rock-solid, no coordinate frame issues)
//   - pointerEvents="none" on thumb so it never intercepts the container touch
//   - onPanResponderTerminate to cleanly exit if ScrollView swipes in
// ====================================================

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { View, Animated, PanResponder, StyleSheet, Text } from 'react-native';

const THUMB = 32;   // container size for emoji
const TRACK = 14;   // track bar height

interface Props {
  value: number;              // 0–100 initial value
  fillColor: string;
  step?: number;
  onValueChange?: (v: number) => void;
  onSlidingComplete?: (v: number) => void;
  /** When provided, drives fill width externally (refuel animation).
   *  During drag also kept in sync so fill follows the thumb. */
  animatedFill?: Animated.Value;
}

export function FuelSlider({
  value, fillColor, step = 5,
  onValueChange, onSlidingComplete, animatedFill,
}: Props) {
  const containerRef = useRef<View>(null);
  // Width captured via onLayout — reliable on all platforms
  const widthRef     = useRef(1);
  // Tracks the value at the moment the drag starts, so dx offsets are correct
  const baseValueRef = useRef(value);
  const valueRef     = useRef(value);
  const [width, setWidth]   = useState(1);
  const [local, setLocal]   = useState(value);
  const isDraggingRef       = useRef(false);

  // Sync internal state whenever the parent changes `value` prop
  // Guard: do NOT override local state while the user is actively dragging
  useEffect(() => {
    if (!isDraggingRef.current) {
      valueRef.current  = value;
      baseValueRef.current = value;
      setLocal(value);
    }
  }, [value]);

  // onLayout is more reliable than measure() for container width.
  // It fires synchronously as part of the layout pass on both platforms.
  const handleLayout = useCallback((e: { nativeEvent: { layout: { width: number } } }) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) {
      widthRef.current = w;
      setWidth(w);
    }
  }, []);

  /**
   * Snap a fraction (0–1) to the nearest step value (0–100).
   */
  const snapFraction = (fraction: number): number => {
    const clamped = Math.max(0, Math.min(1, fraction));
    return Math.round((clamped * 100) / step) * step;
  };

  const pan = useRef(PanResponder.create({
    // Capture phase: claim the gesture BEFORE ScrollView or any parent can intercept.
    // This is the critical fix for horizontal drags inside a vertical ScrollView.
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponderCapture:  () => true,
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,

    onPanResponderGrant: () => {
      isDraggingRef.current = true;
      // Do NOT read nativeEvent coordinates AT ALL. They are fundamentally broken
      // inside Animated.View on Android. Instead, use the current visual value 
      // as the anchor and strictly rely on relative dx displacement.
      baseValueRef.current = valueRef.current;
      animatedFill?.setValue(valueRef.current);
      onValueChange?.(valueRef.current);
    },

    onPanResponderMove: (_, gestureState) => {
      // dx is the total horizontal displacement from the grant point — rock-solid
      const deltaPct   = (gestureState.dx / widthRef.current) * 100;
      const rawValue   = baseValueRef.current + deltaPct;
      const fraction   = rawValue / 100;
      const v = snapFraction(fraction);
      if (v === valueRef.current) return;
      valueRef.current = v;
      setLocal(v);
      animatedFill?.setValue(v);
      onValueChange?.(v);
    },

    onPanResponderRelease: (_, gestureState) => {
      const deltaPct = (gestureState.dx / widthRef.current) * 100;
      const rawValue = baseValueRef.current + deltaPct;
      const v = snapFraction(rawValue / 100);
      valueRef.current = v;
      baseValueRef.current = v;
      setLocal(v);
      animatedFill?.setValue(v);
      isDraggingRef.current = false;
      onSlidingComplete?.(v);
    },

    // ScrollView may reclaim the gesture mid-drag — clean exit, commit last known value
    onPanResponderTerminate: () => {
      isDraggingRef.current = false;
      baseValueRef.current = valueRef.current;
      onSlidingComplete?.(valueRef.current);
    },
  })).current;

  // Fill: animatedFill when provided (for external animation), else local state
  const fillWidth: any = animatedFill
    ? animatedFill.interpolate({
        inputRange: [0, 100], outputRange: ['0%', '100%'], extrapolate: 'clamp',
      })
    : `${local}%`;

  // Thumb: centered on the value position using measured width (state)
  const thumbLeft = (local / 100) * width - THUMB / 2;

  return (
    <View
      ref={containerRef}
      style={st.container}
      onLayout={handleLayout}
      {...pan.panHandlers}
    >
      {/* Track background */}
      <View style={st.track}>
        {animatedFill
          ? <Animated.View style={[st.fill, { width: fillWidth, backgroundColor: fillColor }]} />
          : <View        style={[st.fill, { width: fillWidth, backgroundColor: fillColor }]} />
        }
      </View>

      {/* 🚗 Car emoji thumb — pointerEvents="none" so it never hijacks the container touch */}
      <View style={[st.thumbBox, { left: thumbLeft }]} pointerEvents="none">
        <Text style={st.thumbEmoji}>🚗</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  container: {
    height: THUMB + 10,
    justifyContent: 'center',
  },
  track: {
    height: TRACK,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: TRACK / 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: TRACK / 2,
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
  },
  thumbEmoji: {
    fontSize: 22,
    lineHeight: 28,
  },
});
