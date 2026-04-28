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
  StyleSheet, Pressable, Animated, Linking, TextInput,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { FuelSlider } from '../../src/components/FuelSlider';
import { SmartTankState } from '../../src/utils/types';

// ─── InteractiveTankBar ───────────────────────────────────────────────────────
// Always-interactive fuel bar: label row + FuelSlider with directional gesture.
// Replaces the old ShadowTankBar + TankGaugeSlider dual-layer architecture.
function InteractiveTankBar({
  value, onValueChange, onSlidingComplete, totalRangeKm, animatedPct, isEstimated, fuelTypeLabel,
}: {
  value: number;
  onValueChange: (v: number) => void;
  onSlidingComplete: (v: number) => void;
  totalRangeKm: number | null;
  animatedPct: Animated.Value;
  isEstimated: boolean;
  fuelTypeLabel?: string;
}) {
  const color = value > 50 ? '#22C55E' : value > 25 ? '#F59E0B' : '#EF4444';
  const prefix = isEstimated ? '~' : '';
  const rightLabel = totalRangeKm
    ? `${prefix}${Math.round(value)}% · ${Math.round((value / 100) * totalRangeKm)} km`
    : `${prefix}${Math.round(value)}%`;
  return (
    <View style={itb.container}>
      <View style={itb.labelRow}>
        <Text style={itb.left}>
          {isEstimated ? t('tankLabelEst') : t('tankLabel')}{fuelTypeLabel ? `  ·  ${fuelTypeLabel}` : ''}
        </Text>
        <Text style={[itb.right, { color }]}>{rightLabel}</Text>
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
const itb = StyleSheet.create({
  container: { marginHorizontal: 20, gap: 6 },
  labelRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  left:      { color: '#6B7280', fontSize: 12, fontWeight: '500' },
  right:     { fontSize: 12, fontWeight: '700' },
});

// ─── Skeleton Components (cold-start placeholders) ────────────────────────────
// Lightweight shimmer placeholders shown while decision data loads.
// Uses native Animated opacity pulse — zero external dependencies.

function SkeletonPulse({ style }: { style?: any }) {
  const pulse = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.6, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.3, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return <Animated.View style={[skel.base, style, { opacity: pulse }]} />;
}

function SkeletonCircle({ size = 140 }: { size?: number }) {
  return (
    <View style={skel.circleWrap}>
      <SkeletonPulse style={[skel.circle, { width: size, height: size, borderRadius: size / 2 }]} />
    </View>
  );
}

function SkeletonCard() {
  return (
    <View style={skel.card}>
      <View style={skel.cardRow}>
        <SkeletonPulse style={skel.cardBrand} />
        <SkeletonPulse style={skel.cardPrice} />
      </View>
      <SkeletonPulse style={skel.cardAddr} />
      <SkeletonPulse style={skel.cardDist} />
    </View>
  );
}

function SkeletonReason() {
  return (
    <View style={skel.reason}>
      <SkeletonPulse style={skel.reasonLine1} />
      <SkeletonPulse style={skel.reasonLine2} />
    </View>
  );
}

const skel = StyleSheet.create({
  base:       { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8 },
  circleWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 12, minHeight: 160 },
  circle:     { backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.06)' },
  card:       { marginHorizontal: 16, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 14, gap: 10 },
  cardRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardBrand:  { width: 100, height: 16, borderRadius: 6 },
  cardPrice:  { width: 60, height: 18, borderRadius: 6 },
  cardAddr:   { width: '70%', height: 12, borderRadius: 4 },
  cardDist:   { width: '40%', height: 12, borderRadius: 4 },
  reason:     { marginHorizontal: 16, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 14, gap: 8 },
  reasonLine1:{ width: '85%', height: 14, borderRadius: 6 },
  reasonLine2:{ width: '55%', height: 14, borderRadius: 6 },
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
import { PatternConfirmBanner } from '../../src/components/PatternConfirmBanner';
import { useRefuelConfirm } from '../../src/hooks/useRefuelConfirm';
import { formatFuelType } from '../../src/utils/formatters';
import { t } from '../../src/utils/i18n';

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
  const commonAreas         = useUserStore(s => s.commonAreas);
  // corridorStation no longer used in UI — corridor override handled in fuelStore (isCorridorPick)
  // i18n reactive dependency — re-renders this component when language changes
  const _lang = useUserStore(s => s.language); // eslint-disable-line @typescript-eslint/no-unused-vars

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
  type AppMode = 'normal' | 'animating';
  const [mode, setMode] = useState<AppMode>('normal');
  const [sliderValue, setSliderValue]   = useState(Math.round(fuelPct));
  const [euroInput, setEuroInput]       = useState('');

  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Deep-copy of smartTank captured just before a refuel is recorded — enables true state rollback. */
  const smartTankSnapshotRef = useRef<SmartTankState | null>(null);
  /** Suppress low-tank banner for 10s after any manual level adjustment */
  const suppressBannerUntilRef = useRef(0);

  // ─── Content fade-in (skeleton → real content transition) ─────────────────
  const contentFade = useRef(new Animated.Value(0)).current;
  const hasShownContent = useRef(false);

  useEffect(() => {
    if (decision && !hasShownContent.current) {
      hasShownContent.current = true;
      Animated.timing(contentFade, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [decision]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Rück button: spring in/out ────────────────────────────────────────────
  const ruckAnim = useRef(new Animated.Value(0)).current;
  const showUndo = mode === 'animating';
  useEffect(() => {
    Animated.spring(ruckAnim, {
      toValue: showUndo ? 1 : 0,
      useNativeDriver: true,
      damping: 18,
      stiffness: 220,
      mass: 0.7,
    }).start();
  }, [showUndo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep slider in sync with engine-computed fuelPct when in normal mode
  useEffect(() => {
    if (mode === 'normal') {
      setSliderValue(Math.round(fuelPct));
      animatedPct.setValue(fuelPct);
    }
  }, [fuelPct, mode]); // eslint-disable-line react-hooks/exhaustive-deps

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
      // Slider is always interactive — highlight animation draws attention
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
  const showEstimateBanner = !pendingPattern
    && (refuelBanner === 'timeout' || refuelBanner === 'low_alert')
    && mode === 'normal'
    && Date.now() > suppressBannerUntilRef.current;

  const setLastPrompted = useUserStore(s => s.setLastPrompted);
  useEffect(() => {
    if (refuelBanner === 'low_alert' && showEstimateBanner) {
      setLastPrompted();
    }
  }, [refuelBanner, showEstimateBanner, setLastPrompted]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  function handleGetankt() {
    if (fuelPct >= 100) return;
    // Save deep-copy snapshot BEFORE the refuel event is written — enables true rollback on Undo
    smartTankSnapshotRef.current = smartTank ? JSON.parse(JSON.stringify(smartTank)) : null;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); // strong, felt on all Android devices
    prevFuelPctRef.current = fuelPct;
    const eurosSpent = parseFloat(euroInput) || 0;
    // Convert euros to litres using current fuel price
    const pricePerL = decision?.station?.price ?? 0;
    const litresAdded = pricePerL > 0 ? eurosSpent / pricePerL : 0;
    const cappedLitres = smartTank
      ? Math.min(litresAdded, smartTank.tankCapacityL)
      : litresAdded;
    recordSmartRefuel(cappedLitres, 'user_tap');
    setEuroInput('');
    suppressBannerUntilRef.current = Date.now() + 10_000;
    setMode('animating');
    Animated.timing(animatedPct, {
      toValue: 100, duration: 500, useNativeDriver: false,
    }).start(() => {
      setSliderValue(100);
      // Return to normal after fill animation; slider stays at 100%
      setMode('normal');
      setTimeout(() => recomputeDecision(), 50);
    });
    console.log(`[HomeScreen] Refuel tapped — prev level=${prevFuelPctRef.current}%`);
  }

  function handleUndo() {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const prev = prevFuelPctRef.current;

    if (smartTankSnapshotRef.current) {
      // True rollback: restore the exact state that existed before the refuel button was tapped.
      // This eliminates the ghost refuel event from refuelHistory (important for EMA accuracy).
      restoreSmartTankSnapshot(smartTankSnapshotRef.current);
      smartTankSnapshotRef.current = null;
      console.log(`[HomeScreen] Undo — full snapshot restored to ${prev}%`);
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); // distinct from "success" tap
    Animated.timing(animatedPct, {
      toValue: prev, duration: 400, useNativeDriver: false,
    }).start();
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
    // Recompute decision with new level (no network call)
    setTimeout(() => recomputeDecision(), 50);
    console.log(`[HomeScreen] Level adjusted to ${val}%`);
  }

  return (
    <View style={styles.screen}>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={onRefresh}
            tintColor="#6366F1"
            colors={['#6366F1']}
          />
        }
      >


      {/* ── Priority Banner Stack ── */}
      {pendingPattern ? (
        <PatternConfirmBanner
          pattern={pendingPattern}
          onConfirm={() => confirmTripPattern(pendingPattern.dayOfWeek, true)}
          onReject={()  => confirmTripPattern(pendingPattern.dayOfWeek, false)}
          onDismiss={() => confirmTripPattern(pendingPattern.dayOfWeek, false)}
        />
      ) : permissionDenied ? (
        <View style={styles.refuelBanner}>
          <Text style={styles.refuelBannerText}>
            {t('locationDenied')}
          </Text>
          <TouchableOpacity
            onPress={() => Linking.openSettings()}
            style={styles.refuelBannerBtn}
          >
            <Text style={styles.refuelBannerBtnText}>{t('systemSettings')}</Text>
          </TouchableOpacity>
        </View>
      ) : commonAreas.length === 0 ? (
        <TouchableOpacity
          style={styles.setupBanner}
          onPress={() => router.push('/settings')}
          activeOpacity={0.8}
          accessibilityLabel={t('setupSmartTankA11y')}
        >
          <Text style={styles.setupBannerText}>
            {t('setupAddressHint')}
          </Text>
          <Text style={styles.setupBannerCta}>{t('setupCta')}</Text>
        </TouchableOpacity>
      ) : showEstimateBanner ? (
        <View style={styles.refuelBanner}>
          <Text style={styles.refuelBannerText}>
            {refuelBanner === 'low_alert' ? t('tankLowAlert') : t('estimateOutdated')}
          </Text>
          <TouchableOpacity
            onPress={() => recordSmartRefuel(0, 'low_alert')}
            style={styles.refuelBannerBtn}
          >
            <Text style={styles.refuelBannerBtnText}>{t('yesReset')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* ── Tank area — always-interactive ─────────────────────────────── */}
      <Animated.View style={[
        styles.tankArea,
        { backgroundColor: tankBgColor, borderColor: tankBorderColor, borderWidth: 1, borderRadius: 16, marginHorizontal: -12, paddingHorizontal: 12, paddingVertical: 8 }
      ]}>
        <InteractiveTankBar
          value={sliderValue}
          onValueChange={setSliderValue}
          onSlidingComplete={handleSliderCommit}
          totalRangeKm={totalRangeKm}
          animatedPct={animatedPct}
          isEstimated={isEstimated}
          fuelTypeLabel={formatFuelType(fuelType)}
        />

        {/* Undo row — fixed height, spring in/out, no layout shift */}
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
              accessibilityLabel={t('undoRefuelA11y')}
            >
              <Text style={styles.undoFloatingText}>{t('undoLabel')}</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Animated.View>


      {/* ── Traffic Light ── */}
      <View style={styles.lightContainer}>
        {decision ? (
          <Animated.View style={{ opacity: contentFade }}>
            {decision.recommendation === 'Go' ? (
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/stations', params: { highlightId: decision.station?.id ?? '' } })}
                activeOpacity={0.82}
                accessibilityLabel={t('goStationsA11y')}
              >
                <TrafficLight recommendation={decision.recommendation} size={140} />
                <Text style={styles.goHint}>{t('viewStations')}</Text>
              </TouchableOpacity>
            ) : (
              <TrafficLight recommendation={decision.recommendation} size={140} />
            )}
          </Animated.View>
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorEmoji}>⚠️</Text>
            <Text style={styles.errorText}>{t('couldNotLoad')}</Text>
            <Text style={styles.errorDetail}>{error}</Text>
          </View>
        ) : (
          <SkeletonCircle size={140} />
        )}
      </View>

      {/* ── Reason Card ── */}
      {decision ? (
        <Animated.View style={{ opacity: contentFade }}>
          <ReasonCard
            reason={decision.reason}
            recommendation={decision.recommendation}
          />
        </Animated.View>
      ) : !error ? (
        <SkeletonReason />
      ) : null}

      {/* ── Best Station ── */}
      {decision?.recommendation !== 'Skip' && decision?.station ? (
        <Animated.View style={{ opacity: contentFade }}>
          <View style={styles.stationSection}>
            <Text style={styles.sectionLabel}>{t('bestOptionNearby')}</Text>
            <TouchableOpacity onPress={() => router.push({ pathname: '/stations', params: { highlightId: decision.station?.id ?? '' } })} activeOpacity={0.7}>
              <StationCard
                station={decision.station}
                saving={decision.saving_estimate}
                isCorridorPick={decision.isCorridorPick}
              />
            </TouchableOpacity>
          </View>
        </Animated.View>
      ) : !decision && !error ? (
        <View style={styles.stationSection}>
          <SkeletonPulse style={{ width: 120, height: 11, borderRadius: 4, marginLeft: 20, marginBottom: 8 }} />
          <SkeletonCard />
        </View>
      ) : null}

      {/* Corridor banner removed — corridor station now shown via isCorridorPick in StationCard */}

      {/* ── Bottom Actions ── */}
      <View style={styles.actions}>
        <View style={styles.getanktRow}>
          <Pressable
            style={({ pressed }) => [
              styles.refuelBtn, 
              (fuelPct >= 100 || mode !== 'normal') && styles.refuelBtnDisabled,
              pressed && mode === 'normal' && fuelPct < 100 && { opacity: 0.7 }
            ]}
            onPress={handleGetankt}
            disabled={fuelPct >= 100 || mode !== 'normal'}
            accessibilityLabel={t('markRefueledA11y')}
          >
            <Text style={[
              styles.refuelBtnText, 
              (fuelPct >= 100 || mode !== 'normal') && styles.refuelBtnTextDisabled
            ]}>
              {t('iRefueled')}
            </Text>
          </Pressable>
          {mode === 'normal' && (
            <TextInput
              style={styles.litresInput}
              value={euroInput}
              onChangeText={(v: string) => setEuroInput(v.replace(/[^0-9.]/g, ''))}
              placeholder="€"
              placeholderTextColor="#4B5563"
              keyboardType="decimal-pad"
              maxLength={6}
              returnKeyType="done"
              accessibilityLabel="Euros spent on refuel"
            />
          )}
        </View>
      </View>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen:     { flex: 1, backgroundColor: '#0D0F14' },
  scrollView: { flex: 1 },
  content:    { paddingBottom: 24, gap: 14 },
  headerRow: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
  },
  subtitle:    { fontSize: 13, color: '#6B7280' },
  // (settingsBtnFixed removed — settings now in tab header right)

  lightContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    minHeight: 160,
  },
  // (loadingBox/loadingText removed — replaced by SkeletonCircle)
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
  // (tankHint removed — slider is always interactive, tip no longer needed)
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

  tankArea: {},
  undoRow: {
    height: 34,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingRight: 4,
    alignItems: 'center',
  },
  litresInput: {
    backgroundColor: 'rgba(99,102,241,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.3)',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#A5B4FC',
    fontSize: 14,
    fontWeight: '600',
    width: 72,
    textAlign: 'center',
  },
});
