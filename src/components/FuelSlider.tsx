// ====================================================
// FuelAmpel — FuelSlider  (custom PanResponder slider)
//
// Thumb: 🚗 emoji — fun, thematic, instantly clear
// Fill:  colored track (green/amber/red) matching level
// Supports external Animated.Value for fill animation
//
// Fix: width starts in state (not just ref) so thumb
//      appears at correct position on first render.
// ====================================================

import React, { useRef, useState, useCallback } from 'react';
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
  // width in BOTH ref (for PanResponder closure) AND state (for initial render)
  const widthRef  = useRef(1);
  const pageXRef  = useRef(0);
  const valueRef  = useRef(value);
  const [width, setWidth] = useState(1);   // triggers re-render once measured
  const [local, setLocal] = useState(value);

  // Measure after layout — sets state so thumb jumps to correct position
  const measure = useCallback(() => {
    containerRef.current?.measure((_x, _y, w, _h, px) => {
      widthRef.current = w;
      pageXRef.current = px;
      setWidth(w); // ← this re-render fixes the initial position bug
    });
  }, []);

  const snap = (pageX: number) => {
    const rel = Math.max(0, Math.min(1, (pageX - pageXRef.current) / widthRef.current));
    return Math.round((rel * 100) / step) * step;
  };

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderGrant: (e) => {
      const v = snap(e.nativeEvent.pageX);
      valueRef.current = v;
      setLocal(v);
      animatedFill?.setValue(v); // keep fill in sync with thumb during drag
      onValueChange?.(v);
    },
    onPanResponderMove: (e) => {
      const v = snap(e.nativeEvent.pageX);
      if (v === valueRef.current) return;
      valueRef.current = v;
      setLocal(v);
      animatedFill?.setValue(v); // sync fill
      onValueChange?.(v);
    },
    onPanResponderRelease: (e) => {
      const v = snap(e.nativeEvent.pageX);
      valueRef.current = v;
      setLocal(v);
      animatedFill?.setValue(v);
      onSlidingComplete?.(v);
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
      onLayout={measure}
      {...pan.panHandlers}
    >
      {/* Track background */}
      <View style={st.track}>
        {animatedFill
          ? <Animated.View style={[st.fill, { width: fillWidth, backgroundColor: fillColor }]} />
          : <View        style={[st.fill, { width: fillWidth, backgroundColor: fillColor }]} />
        }
      </View>

      {/* 🚗 Car emoji thumb — centered on value position */}
      <View style={[st.thumbBox, { left: thumbLeft }]}>
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
