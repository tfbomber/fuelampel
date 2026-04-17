// ====================================================
// FuelAmpel — Decide Tab (Home Screen)  v3
//
// Changes vs v2:
//  - "Ich habe getankt" triggers fill animation to 100%
//  - Undo button appears alongside (pendingRefuelConfirm guard)
//  - Post-refuel Slider for final level adjustment
//  - ShadowTankBar receives animatedPct + totalRangeKm
// ====================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, RefreshControl, TouchableOpacity,
  ActivityIndicator, StyleSheet, Pressable, Animated, Linking
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { FuelSlider } from '../../src/components/FuelSlider';
import { SmartTankState } from '../../src/utils/types';

// ─── TankGaugeSlider ──────────────────────────────────────────────────────────
// Single combined component: animated fill bar + thumb slider overlaid in one.
function TankGaugeSlider({
  value, onValueChange, onSlidingComplete, totalRangeKm, animatedPct, isEstimated,
}: {
  value: number;
  onValueChange: (v: number) => void;
  onSlidingComplete: (v: number) => void;
  totalRangeKm: number | null;
  animatedPct: Animated.Value;
  isEstimated: boolean;
}) {
  const color = value > 50 ? '#22C55E' : value > 25 ? '#F59E0B' : '#EF4444';
  const rightLabel = totalRangeKm
    ? `${Math.round(value)}% · ${Math.round((value / 100) * totalRangeKm)} km`
    : `${Math.round(value)}%`;
  return (
    <View style={tgs.container}>
      <View style={tgs.labelRow}>
        <Text style={tgs.left}>{isEstimated ? '〜 Tank' : '⛽ Tank'}</Text>
        <Text style={[tgs.right, { color }]}>{rightLabel}</Text>
      </View>
      <FuelSlider
        value={value}
        fillColor={color}
        animatedFill={animatedPct}
        onValueChange={onValueChange}
        onSlidingComplete={onSlidingComplete}
      />
    </View>
  );
}
const tgs = StyleSheet.create({
  container: { marginHorizontal: 20, gap: 6 },
  labelRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  left:      { color: '#6B7280', fontSize: 12, fontWeight: '500' },
  right:     { fontSize: 12, fontWeight: '700' },
});
// ────────────────────────────────────────────────────────────────────────────────
import { useDecision } from '../../src/hooks/useDecision';
import * as Haptics from 'expo-haptics';
import { useFuelStore } from '../../src/store/fuelStore';
import { useUserStore } from '../../src/store/userStore';
import {
  estimateLevelPercent,
  shouldAskPatternConfirm,
  computeConfidence,
} from '../../src/core/smartTank';
import { getFuelLevelPercent } from '../../src/core/shadowTank';
import { CONFIDENCE_HIGH } from '../../src/utils/constants';
import { TrafficLight } from '../../src/components/TrafficLight';
import { ReasonCard } from '../../src/components/ReasonCard';
import { StationCard } from '../../src/components/StationCard';
import { ShadowTankBar } from '../../src/components/ShadowTankBar';
import { PatternConfirmBanner } from '../../src/components/PatternConfirmBanner';
import { useRefuelConfirm } from '../../src/hooks/useRefuelConfirm';
import { formatFuelType } from '../../src/utils/formatters';

export default function HomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { decision, isLoading, error, refresh, permissionDenied } = useDecision();
  const recomputeDecision = useFuelStore(s => s.recomputeDecision);

  const fuelType           = useUserStore(s => s.fuelType);
  const shadowTank         = useUserStore(s => s.shadowTank);
  const smartTank          = useUserStore(s => s.smartTank);
  const recordSmartRefuel  = useUserStore(s => s.recordSmartRefuel);
  const adjustLevelManually = useUserStore(s => s.adjustLevelManually);
  const restoreSmartTankSnapshot = useUserStore(s => s.restoreSmartTankSnapshot);
  const confirmTripPattern  = useUserStore(s => s.confirmTripPattern);

  // ─── Tank level ───────────────────────────────────────────────────────────
  const isSmartActive = smartTank !== null;
  const fuelPct = isSmartActive
    ? estimateLevelPercent(smartTank!)
    : getFuelLevelPercent(shadowTank);
  const totalRangeKm = smartTank?.totalRangeKm ?? null;
  // ~ prefix shown whenever confidence is below HIGH threshold (time-decayed)
  const confidence   = isSmartActive ? computeConfidence(smartTank!) : 0;
  const isEstimated  = isSmartActive && confidence < CONFIDENCE_HIGH;

  // ─── Save previous level for undo ─────────────────────────────────────────
  const prevFuelPctRef = useRef(fuelPct);

  // ─── Animated fill value ───────────────────────────────────────────────────
  const animatedPct = useRef(new Animated.Value(fuelPct)).current;

  // Post-refuel Mode state
  type AppMode = 'normal' | 'animating' | 'adjusting' | 'soft_confirm';
  const [mode, setMode] = useState<AppMode>('normal');
  const [sliderValue, setSliderValue]   = useState(100);

  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** true = mode was triggered by "ich habe getankt"; false = manual long-press adjust */
  const isRefuelModeRef = useRef(false);
  /** Deep-copy of smartTank captured just before a refuel is recorded — enables true state rollback. */
  const smartTankSnapshotRef = useRef<SmartTankState | null>(null);
  /** Suppress low-tank banner for 10s after any manual level adjustment */
  const suppressBannerUntilRef = useRef(0);
  /** For double-tap detection on ShadowTankBar */
  const lastTankTapRef = useRef(0);

  // ── Rück button: spring in/out, never shifts layout ─────────────────────
  const ruckAnim = useRef(new Animated.Value(0)).current;
  const showUndo = mode === 'adjusting' || mode === 'soft_confirm';
  useEffect(() => {
    Animated.spring(ruckAnim, {
      toValue: showUndo ? 1 : 0,
      useNativeDriver: true,
      damping: 18,
      stiffness: 220,
      mass: 0.7,
    }).start();
  }, [showUndo]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Tank component crossfade (ShadowTankBar ↔ TankGaugeSlider) ──────────
  // `displayedMode` lags behind real mode during the 120ms fade-out,
  // ensuring the OLD component fades out before the NEW one appears.
  const switchAnim = useRef(new Animated.Value(1)).current;
  const [displayedMode, setDisplayedMode] = useState<AppMode>(mode);
  const isSliderMode = (m: AppMode) => m === 'adjusting';
  useEffect(() => {
    // Only animate on ShadowTankBar ↔ Slider transitions (not animating→adjusting skips)
    if (isSliderMode(mode) === isSliderMode(displayedMode)) {
      setDisplayedMode(mode); // same visual type — update immediately without animation
      return;
    }
    Animated.timing(switchAnim, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
      setDisplayedMode(mode);
      Animated.timing(switchAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    });
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(
    useCallback(() => {
      return () => {
        // On blur: hide undo row and revert to normal immediately
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
        setMode('normal');
      };
    }, [])
  );

  // ─── Highlight Tank Parameter Hook ────────────────────────────────────────
  const highlightAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (params.action === 'highlightTank') {
      router.setParams({ action: '' });
      
      Animated.sequence([
        Animated.timing(highlightAnim, { toValue: 1, duration: 300, useNativeDriver: false }),
        Animated.timing(highlightAnim, { toValue: 0, duration: 300, useNativeDriver: false }),
        Animated.timing(highlightAnim, { toValue: 1, duration: 300, useNativeDriver: false }),
        Animated.timing(highlightAnim, { toValue: 0, duration: 800, useNativeDriver: false }),
      ]).start();

      // Automatically open the slider thumb for adjustment
      if (mode === 'normal') {
        // use a slight timeout so the animation draws attention first
        setTimeout(() => handleManualAdjust(), 600);
      }
    }
  }, [params.action]);

  const tankBgColor = highlightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['transparent', 'rgba(251, 191, 36, 0.15)'] // Amber/Gold wash
  });
  const tankBorderColor = highlightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(0,0,0,0)', 'rgba(251, 191, 36, 0.4)'] 
  });

  // ─── Refuel confirm banner (low-tank / timeout) ───────────────────────────
  const { banner: refuelBanner } = useRefuelConfirm();

  // ─── Trip pattern banner ──────────────────────────────────────────────────
  const pendingPattern = isSmartActive
    ? (smartTank!.tripPatterns.find(p => shouldAskPatternConfirm(smartTank!, p)) ?? null)
    : null;

  const onRefresh = useCallback(async () => { await refresh(); }, [refresh]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  function handleGetankt() {
    if (fuelPct >= 100) return;
    // Save deep-copy snapshot BEFORE the refuel event is written — enables true rollback on Undo
    smartTankSnapshotRef.current = smartTank ? JSON.parse(JSON.stringify(smartTank)) : null;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); // strong, felt on all Android devices
    prevFuelPctRef.current = fuelPct;
    isRefuelModeRef.current = true;
    recordSmartRefuel(0, 'user_tap');
    suppressBannerUntilRef.current = Date.now() + 10_000;
    setMode('animating');
    Animated.timing(animatedPct, {
      toValue: 100, duration: 500, useNativeDriver: false,
    }).start(() => {
      setSliderValue(100);
      setMode('adjusting');
      // Recompute after fill animation; store already has the refuel recorded
      setTimeout(() => recomputeDecision(), 50);
    });
    console.log(`[HomeScreen] Refuel tapped — prev level=${prevFuelPctRef.current}%`);
  }

  function handleUndo() {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const prev = prevFuelPctRef.current;

    if (isRefuelModeRef.current && smartTankSnapshotRef.current) {
      // True rollback: restore the exact state that existed before the refuel button was tapped.
      // This eliminates the ghost refuel event from refuelHistory (important for EMA accuracy).
      restoreSmartTankSnapshot(smartTankSnapshotRef.current);
      smartTankSnapshotRef.current = null;
      console.log(`[HomeScreen] Undo — full snapshot restored to ${prev}%`);
    } else {
      // Manual adjust undo — no refuel event recorded, just correct the level
      adjustLevelManually(prev);
      console.log(`[HomeScreen] Undo — manual adjust reverted to ${prev}%`);
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); // distinct from "success" tap
    Animated.timing(animatedPct, {
      toValue: prev, duration: 400, useNativeDriver: false,
    }).start();
    isRefuelModeRef.current = false;
    setMode('normal');
    // Recompute decision with reverted level (no network call)
    setTimeout(() => recomputeDecision(), 50);
  }

  function handleSliderCommit(val: number) {
    adjustLevelManually(val);
    Animated.timing(animatedPct, {
      toValue: val, duration: 300, useNativeDriver: false,
    }).start();
    suppressBannerUntilRef.current = Date.now() + 10_000;
    setMode('normal');
    // Recompute decision with new level (no network call)
    setTimeout(() => recomputeDecision(), 50);
    console.log(`[HomeScreen] Level adjusted to ${val}%`);
  }

  function handleBlankTap() {
    if (mode === 'adjusting') {
      // Commit the current slider value before exiting adjust mode.
      // Without this, the bar stays at the dragged position visually but
      // the store retains the old value, causing a mismatch on next render.
      handleSliderCommit(sliderValue);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    }
  }

  /**
   * Long-press on the ShadowTankBar (normal mode) — enter manual adjust
   * WITHOUT recording a refuel event. Slider starts at current fuelPct.
   * Undo reverts to pre-drag value; no store record is written until
   * handleSliderCommit is called.
   */
  function handleManualAdjust() {
    if (mode !== 'normal') return;
    prevFuelPctRef.current = fuelPct;
    isRefuelModeRef.current = false;
    setSliderValue(Math.round(fuelPct));
    animatedPct.setValue(fuelPct);
    setMode('adjusting');
    console.log(`[HomeScreen] Manual adjust via long-press/double-tap at ${fuelPct}%`);
  }

  /** Double-tap handler for ShadowTankBar — same trigger as long-press */
  function handleTankTap() {
    if (mode !== 'normal') return;
    const now = Date.now();
    if (now - lastTankTapRef.current < 350) {
      // Double-tap detected
      lastTankTapRef.current = 0;
      handleManualAdjust();
    } else {
      lastTankTapRef.current = now;
    }
  }

  // Determine slider display label
  const sliderLabel = totalRangeKm
    ? `≈ ${Math.round((sliderValue / 100) * totalRangeKm)} km`
    : `${Math.round(sliderValue)}%`;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      // Disable scroll while the tank slider is active — prevents ScrollView from
      // stealing horizontal PanResponder gesture events from FuelSlider.
      scrollEnabled={mode !== 'adjusting'}
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={onRefresh}
          tintColor="#6366F1"
          colors={['#6366F1']}
        />
      }
    >
      {mode === 'adjusting' && (
        <Pressable style={styles.absoluteOverlay} onPress={handleBlankTap} />
      )}

      {/* ── Header row ── */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.subtitle}>{formatFuelType(fuelType)}</Text>
        </View>
        <TouchableOpacity
          style={styles.settingsBtn}
          onPress={() => router.push('/settings')}
          accessibilityLabel="Open settings"
        >
          <Text style={styles.settingsIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* ── Pattern Confirm Banner ── */}
      {pendingPattern && (
        <PatternConfirmBanner
          pattern={pendingPattern}
          onConfirm={() => confirmTripPattern(pendingPattern.dayOfWeek, true)}
          onReject={()  => confirmTripPattern(pendingPattern.dayOfWeek, false)}
          onDismiss={() => confirmTripPattern(pendingPattern.dayOfWeek, false)}
        />
      )}

      {/* ── Permission Denied Banner ── */}
      {permissionDenied && (
        <View style={styles.refuelBanner}>
          <Text style={styles.refuelBannerText}>
            📍 Location access denied. Please enable in system settings.
          </Text>
          <TouchableOpacity
            onPress={() => Linking.openSettings()}
            style={styles.refuelBannerBtn}
          >
            <Text style={styles.refuelBannerBtnText}>❯ System</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── SmartTank Not Configured Banner ── */}
      {!isSmartActive && (
        <TouchableOpacity
          style={styles.setupBanner}
          onPress={() => router.push('/settings')}
          activeOpacity={0.8}
          accessibilityLabel="Set up SmartTank"
        >
          <Text style={styles.setupBannerText}>
            💡 SmartTank not configured — tap here to set your home region and enable smart fuel predictions.
          </Text>
          <Text style={styles.setupBannerCta}>Set up ›</Text>
        </TouchableOpacity>
      )}

      {/* ── Refuel Confirm Banner — only 'timeout' type shown */}
      {!pendingPattern && refuelBanner === 'timeout' && mode === 'normal'
        && Date.now() > suppressBannerUntilRef.current && (
        <View style={styles.refuelBanner}>
          <Text style={styles.refuelBannerText}>
            🔄  Estimate may be outdated — did you refuel?
          </Text>
          <TouchableOpacity
            onPress={() => recordSmartRefuel(0, 'low_alert')}
            style={styles.refuelBannerBtn}
          >
            <Text style={styles.refuelBannerBtnText}>Yes, reset</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Tank area ──────────────────────────────────────────────── */}
      <Animated.View style={[
        styles.tankArea,
        (mode === 'adjusting' || mode === 'soft_confirm') ? { zIndex: 20 } : undefined,
        { backgroundColor: tankBgColor, borderColor: tankBorderColor, borderWidth: 1, borderRadius: 16, marginHorizontal: -12, paddingHorizontal: 12, paddingVertical: 8 }
      ]}>
        {/* Tank component: crossfades between ShadowTankBar and TankGaugeSlider */}
        <Animated.View style={{ opacity: switchAnim }}>
          {isSliderMode(displayedMode) ? (
            <TankGaugeSlider
              value={sliderValue}
              onValueChange={setSliderValue}
              onSlidingComplete={handleSliderCommit}
              totalRangeKm={totalRangeKm}
              animatedPct={animatedPct}
              isEstimated={isEstimated}
            />
          ) : (
            <ShadowTankBar
              fuelLevelPercent={fuelPct}
              totalRangeKm={totalRangeKm}
              isEstimated={isEstimated}
              onLongPress={mode === 'normal' ? handleManualAdjust : undefined}
              onPress={mode === 'normal' ? handleTankTap : undefined}
            />
          )}
        </Animated.View>

        {/* Undo row — FIXED height 34px, always in flow — never shifts layout */}
        {/* Rück fades in/out via spring animation, pointerEvents disable when hidden */}
        <View style={styles.undoRow}>
          <Animated.View
            style={[
              styles.undoFloating,
              {
                opacity: ruckAnim,
                transform: [{ scale: ruckAnim.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] }) }],
              },
            ]}
            pointerEvents={showUndo ? 'auto' : 'none'}
          >
            <Pressable
              onPress={handleUndo}
              style={({ pressed }) => pressed ? { opacity: 0.65 } : undefined}
              accessibilityLabel="Undo refuel"
            >
              <Text style={styles.undoFloatingText}>↺ Undo</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Animated.View>

      {/* ── Traffic Light ── */}
      <View style={styles.lightContainer}>
        {isLoading && !decision ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#6366F1" />
            <Text style={styles.loadingText}>Checking prices...</Text>
          </View>
        ) : decision ? (
          decision.recommendation === 'Go' ? (
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/stations', params: { highlightId: decision.station?.id ?? '' } })}
              activeOpacity={0.82}
              accessibilityLabel="GO — tap to see nearby stations"
            >
              <TrafficLight recommendation={decision.recommendation} size={164} />
              <Text style={styles.goHint}>→  View stations</Text>
            </TouchableOpacity>
          ) : (
            <TrafficLight recommendation={decision.recommendation} size={164} />
          )
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorEmoji}>⚠️</Text>
            <Text style={styles.errorText}>Could not load data</Text>
            <Text style={styles.errorDetail}>{error}</Text>
          </View>
        ) : null}
      </View>

      {/* ── Reason Card ── */}
      {decision && (
        <ReasonCard
          reason={decision.reason}
          recommendation={decision.recommendation}
        />
      )}

      {/* ── Best Station ── */}
      {decision?.recommendation !== 'Skip' && decision?.station && (
        <View style={styles.stationSection}>
          <Text style={styles.sectionLabel}>Best Option Nearby</Text>
          <TouchableOpacity onPress={() => router.push({ pathname: '/stations', params: { highlightId: decision.station?.id ?? '' } })} activeOpacity={0.7}>
            <StationCard
              station={decision.station}
              saving={decision.saving_estimate}
            />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Bottom Actions ── */}
      <View style={[styles.actions, (mode === 'adjusting' || mode === 'soft_confirm') ? { zIndex: 20 } : undefined]}>
        <View style={styles.getanktRow}>
          <Pressable
            style={({ pressed }) => [
              styles.refuelBtn, 
              (fuelPct >= 100 || mode !== 'normal') && styles.refuelBtnDisabled,
              pressed && mode === 'normal' && fuelPct < 100 && { opacity: 0.7 }
            ]}
            onPress={handleGetankt}
            disabled={fuelPct >= 100 || mode !== 'normal'}
            accessibilityLabel="Mark as refueled"
          >
            <Text style={[
              styles.refuelBtnText, 
              (fuelPct >= 100 || mode !== 'normal') && styles.refuelBtnTextDisabled
            ]}>
              ⛽  I refueled
            </Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: '#0D0F14' },
  content: { paddingBottom: 48, gap: 16 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
  },
  subtitle:    { fontSize: 13, color: '#6B7280' },
  settingsBtn: { padding: 8 },
  settingsIcon: { fontSize: 22 },
  lightContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    minHeight: 200,
  },
  loadingBox:  { alignItems: 'center', gap: 12 },
  loadingText: { color: '#6B7280', fontSize: 14 },
  errorBox:    { alignItems: 'center', gap: 8 },
  errorEmoji:  { fontSize: 40 },
  errorText:   { color: '#EF4444', fontSize: 16, fontWeight: '600' },
  errorDetail: {
    color: '#6B7280',
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  goHint: {
    color: '#818CF8',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
    opacity: 0.7,
  },
  stationSection: { gap: 8 },
  sectionLabel: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
  },

  // Post-refuel slider
  sliderBox: {
    marginHorizontal: 20,
    backgroundColor: 'rgba(99,102,241,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.2)',
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  sliderLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sliderCaption: { color: '#9CA3AF', fontSize: 12 },
  sliderValue:   { color: '#A5B4FC', fontSize: 14, fontWeight: '700' },
  slider:        { width: '100%', height: 36 },
  sliderHint:    { color: '#4B5563', fontSize: 11, textAlign: 'center' },

  // Bottom action row
  actions:    { alignItems: 'center', gap: 12, paddingTop: 8 },
  getanktRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  refuelBtn: {
    backgroundColor: 'rgba(99,102,241,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.4)',
    borderRadius: 50,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  refuelBtnText: { color: '#A5B4FC', fontSize: 15, fontWeight: '600' },
  refuelBtnDisabled: {
    borderColor: 'rgba(99,102,241,0.1)',
    backgroundColor: 'rgba(99,102,241,0.05)',
  },
  refuelBtnTextDisabled: { color: '#4B5563' },
  // (undoInlineBtn removed — no longer used)
  // (pullHint removed — pull-to-refresh text removed)

  // Refuel confirm inline banner
  refuelBanner: {
    marginHorizontal: 16,
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    borderRadius: 14,
    padding: 14,
    gap: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  refuelBannerText: { color: '#FCA5A5', fontSize: 13, flex: 1 },
  refuelBannerBtn: {
    backgroundColor: 'rgba(239,68,68,0.20)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  refuelBannerBtnText: { color: '#FCA5A5', fontSize: 12, fontWeight: '700' },

  // Setup banner (SmartTank not configured)
  setupBanner: {
    marginHorizontal: 16,
    backgroundColor: 'rgba(99,102,241,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.25)',
    borderRadius: 14,
    padding: 14,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  setupBannerText: { color: '#A5B4FC', fontSize: 13, flex: 1, lineHeight: 18 },
  setupBannerCta:  { color: '#6366F1', fontSize: 14, fontWeight: '700' },

  absoluteOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },

  // Floating undo button — absolutely positioned, no layout shift
  undoFloating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  undoFloatingText: { color: '#FCA5A5', fontSize: 12, fontWeight: '700' },

  // Unified tank wrapper — holds both ShadowTankBar and TankGaugeSlider at same layout size
  tankArea: {},
  // Fixed-height row below the tank bar for the undo button (right-aligned, never shifts layout)
  undoRow: {
    height: 34,             // Fixed — never causes layout shift
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingRight: 4,
    alignItems: 'center',
  },
});
