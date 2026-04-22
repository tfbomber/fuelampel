// ====================================================
// FuelAmpel — Onboarding Screen
//
// Step 0 (Must):  Fuel Type
// Step 1 (Must):  Home & Work area — live address autocomplete (auto-search as you type)
// Step 2 (Must):  Refueling Style
// Step 3 (Optional, skippable): Car Type + Last Refuel Amount
// ====================================================

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useUserStore } from '../src/store/userStore';
import { useFuelStore } from '../src/store/fuelStore';
import {
  FuelType, RefuelingStyle, CarType, LastRefuelAmount, CommonArea,
} from '../src/utils/types';
import { t } from '../src/utils/i18n';
import { LiveAddressInput } from '../src/components/LiveAddressInput';
import { FuelSlider } from '../src/components/FuelSlider';

// ── Option metadata ───────────────────────────────────────────────────────────

const FUEL_TYPES: { value: FuelType; label: string }[] = [
  { value: 'e5',     label: 'Super' },
  { value: 'e10',    label: 'Super E10' },
  { value: 'diesel', label: 'Diesel' },
];

function getRefuelingStyles(): { value: RefuelingStyle; label: string; desc: string }[] {
  return [
    { value: 'nearEmpty', label: t('whenNearlyEmpty'), desc: t('refuelStyleNearEmptyDesc') },
    { value: 'cheapest', label: t('bestPriceAlways'), desc: t('refuelStyleCheapestDesc') },
  ];
}

function getCarTypes(): { value: CarType; label: string }[] {
  return [
    { value: 'small', label: t('carSmall') },
    { value: 'regular', label: t('carFamily') },
    { value: 'large', label: t('carLarge') },
    { value: 'unknown', label: t('carUnknown') },
  ];
}

function getAmounts(): { value: LastRefuelAmount; label: string }[] {
  return [
    { value: '<40', label: t('below40') },
    { value: '40-60', label: t('from40to60') },
    { value: '60-80', label: t('from60to80') },
    { value: '80+', label: t('above80') },
    { value: 'unknown', label: t('dontRemember') },
  ];
}

function getTankLevelLabel(pct: number): string {
  if (pct >= 75) return t('tankLevelMostlyFull');
  if (pct >= 40) return t('tankLevelHalf');
  if (pct >= 15) return t('tankLevelLow');
  return t('tankLevelNearlyEmpty');
}

// ── Progress dots ─────────────────────────────────────────────────────────────

function ProgressDots({ step }: { step: number }) {
  const TOTAL = 5; // 0-4
  return (
    <View style={dotStyles.row}>
      {Array.from({ length: TOTAL }).map((_, i) => (
        <View key={i} style={[dotStyles.dot, i === step && dotStyles.active, i < step && dotStyles.done]} />
      ))}
    </View>
  );
}
const dotStyles = StyleSheet.create({
  row:    { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  dot:    { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.15)' },
  active: { backgroundColor: '#6366F1', width: 18 },
  done:   { backgroundColor: 'rgba(99,102,241,0.4)' },
});

// ── Option Pill ───────────────────────────────────────────────────────────────

function Pill({ selected, label, desc, onPress }: {
  selected: boolean; label: string; desc?: string; onPress: () => void
}) {
  return (
    <TouchableOpacity
      style={[pill.wrap, selected && pill.active]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[pill.label, selected && pill.labelA]}>{label}</Text>
      {desc ? <Text style={[pill.desc, selected && pill.descA]}>{desc}</Text> : null}
    </TouchableOpacity>
  );
}
const pill = StyleSheet.create({
  wrap:   { paddingHorizontal: 16, paddingVertical: 13, borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.09)', backgroundColor: 'rgba(255,255,255,0.04)', gap: 3 },
  active: { backgroundColor: 'rgba(99,102,241,0.18)', borderColor: '#6366F1' },
  label:  { color: '#9CA3AF', fontSize: 15, fontWeight: '700' },
  labelA: { color: '#E0E7FF' },
  desc:   { color: '#4B5563', fontSize: 12 },
  descA:  { color: '#A5B4FC' },
});

// ─────────────────────────────────────────────────────────────────────────────
// SmartTankInitScreen  (existing users — single-step setup)
// Shows just the fuel-level slider + car type selector.
// ─────────────────────────────────────────────────────────────────────────────

function SmartTankInitScreen({ onDone }: { onDone: (pct: number) => void }) {
  const [pct,     setPct]     = useState(50);
  const [carType, setCarType] = useState<CarType | null>(null);
  const carTypes = getCarTypes();

  return (
    <View style={s.screen}>
      <ScrollView
        contentContainerStyle={[s.content, { paddingTop: 80 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text style={s.emoji}>🛢️</Text>
        <Text style={s.title}>{t('smartTankQuickTitle')}</Text>
        <Text style={s.subtitle}>{t('smartTankQuickSubtitle')}</Text>

        {/* Tank level slider */}
        <View style={{ gap: 12, marginTop: 8 }}>
          <Text style={s.sectionLabel}>⛽ {t('onboardingTankTitle')}</Text>

          <View style={levelS.box}>
            <Text style={levelS.pct}>{pct}%</Text>
            <Text style={levelS.label}>{getTankLevelLabel(pct)}</Text>
          </View>

          <FuelSlider
            value={pct}
            fillColor={pct >= 50 ? '#22C55E' : pct >= 25 ? '#F59E0B' : '#EF4444'}
            step={5}
            onValueChange={setPct}
            onSlidingComplete={setPct}
          />
          <Text style={levelS.hint}>{t('tankLevelScaleHint')}</Text>
        </View>

        {/* Car type (reused for capacity estimate) */}
        <View style={{ gap: 10, marginTop: 8 }}>
          <Text style={s.sectionLabel}>🚗 {t('smartTankVehicleTypeHint')}</Text>
          {carTypes.map(c => (
            <Pill
              key={c.value}
              selected={carType === c.value}
              label={c.label}
              onPress={() => setCarType(c.value === carType ? null : c.value)}
            />
          ))}
        </View>

        {/* Done button */}
        <TouchableOpacity
          style={[s.nextBtn, { marginTop: 16 }]}
          onPress={() => onDone(pct)}
          activeOpacity={0.8}
        >
          <Text style={s.nextBtnText}>{t('smartTankDone')}</Text>
        </TouchableOpacity>
        <Text style={[s.hint, { marginTop: 8 }]}>
          {t('smartTankEditLater')}
        </Text>
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Onboarding Component
// ─────────────────────────────────────────────────────────────────────────────

export default function OnboardingScreen() {

  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const _lang = useUserStore(s => s.language);
  const { completeOnboarding, adjustLevelManually, initSmartTank, commonAreas } = useUserStore();
  const refuelingStyles = getRefuelingStyles();
  const carTypes = getCarTypes();
  const amounts = getAmounts();

  // ── SmartTank-only init mode (existing users after update) ────────────
  if (mode === 'smartTankInit') {
    return (
      <SmartTankInitScreen
        onDone={(pct) => {
          const store = useUserStore.getState();
          if (!store.hasCompletedOnboarding) {
            store.completeOnboarding({
              fuelType: 'e5',
              commonAreas: [],
              refuelingStyle: null,
              carType: null,
              lastRefuelAmount: null
            });
          }
          const home = store.commonAreas[0] || { plz: '00000', displayName: 'GPS Default' };
          const work = store.commonAreas[1];
          store.initSmartTank(home, work, pct);
          // Sync decision engine so Home tab shows the correct recommendation immediately
          useFuelStore.getState().recomputeDecision();
          router.replace('/(tabs)');
        }}
      />
    );
  }

  // ── Full onboarding flow (new users) ───────────────────────────────────

  const [step,      setStep]      = useState(0);
  const [fuelType,  setFuelType]  = useState<FuelType>('e5');
  const [homeArea,  setHomeArea]  = useState<CommonArea | null>(null);
  const [workArea,  setWorkArea]  = useState<CommonArea | null>(null);
  const [refStyle,  setRefStyle]  = useState<RefuelingStyle | null>(null);
  const [carType,   setCarType]   = useState<CarType | null>(null);
  const [refAmount, setRefAmount] = useState<LastRefuelAmount | null>(null);
  const [tankPct,   setTankPct]   = useState(50);
  const [totalRangeKm, setTotalRangeKm] = useState<string>(''); // optional km/full tank

  const canProceed =
    step === 0 ? true :
    step === 1 ? homeArea !== null :
    step === 2 ? refStyle !== null :
    true; // step 3 and 4 are always skippable

  function next() {
    if (step < 4) { setStep(s => s + 1); return; }
    commit();
  }

  /**
   * Skip the entire setup — commit whatever data is available and mark
   * SmartTank setup as skipped so OnboardingGate won't block on next launch.
   * The HomeScreen will show a soft setup banner instead.
   */
  function handleSkipAll() {
    const areas: CommonArea[] = [];
    if (homeArea) areas.push(homeArea);
    if (workArea) areas.push(workArea);
    completeOnboarding({
      fuelType, commonAreas: areas,
      refuelingStyle: refStyle, carType, lastRefuelAmount: refAmount,
      initialPct: tankPct,
    });
    useUserStore.getState().skipSmartTankSetup();
    // Sync decision engine immediately so Home tab shows correct state on arrival
    useFuelStore.getState().recomputeDecision();
    console.log('[Onboarding] User skipped SmartTank setup');
    router.replace('/(tabs)');
  }

  function commit() {
    const areas: CommonArea[] = [];
    if (homeArea) areas.push(homeArea);
    if (workArea) areas.push(workArea);
    completeOnboarding({
      fuelType, commonAreas: areas,
      refuelingStyle: refStyle, carType, lastRefuelAmount: refAmount,
      initialPct: tankPct,
    });
    // Apply user-stated initial tank level (now handled in completeOnboarding)
    // Apply optional total range
    const rangeNum = parseFloat(totalRangeKm);
    if (!isNaN(rangeNum) && rangeNum >= 50) {
      // setTotalRangeKm is called post-commit via store
      useUserStore.getState().setTotalRangeKm(rangeNum);
    }
    // Sync decision engine so Home tab shows the correct recommendation immediately
    useFuelStore.getState().recomputeDecision();
    router.replace('/(tabs)');
  }

  return (
    <KeyboardAvoidingView
      style={s.screen}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
    >
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* Top bar */}
        <View style={s.topBar}>
          <ProgressDots step={step} />
          {step > 0 && (
            <TouchableOpacity onPress={() => setStep(s => s - 1)} style={s.backBtn}>
              <Text style={s.backText}>{t('onboardingBack')}</Text>
            </TouchableOpacity>
          )}
          {(step === 3) && (
            <TouchableOpacity onPress={commit} style={s.skipBtn}>
              <Text style={s.skipText}>{t('onboardingSkip')}</Text>
            </TouchableOpacity>
          )}
          {(step === 1 || step === 2) && (
            <TouchableOpacity onPress={handleSkipAll} style={s.skipBtn}>
              <Text style={s.skipText}>{t('onboardingSkip')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Step 0 — Fuel Type */}
        {step === 0 && (
          <View style={s.stepWrap}>
            <Text style={s.emoji}>⛽</Text>
            <Text style={s.title}>{t('onboardingFuelTitle')}</Text>
            <Text style={s.subtitle}>{t('onboardingFuelSubtitle')}</Text>
            <View style={s.options}>
              {FUEL_TYPES.map(t => (
                <Pill key={t.value} selected={fuelType === t.value} label={t.label} onPress={() => setFuelType(t.value)} />
              ))}
            </View>
          </View>
        )}

        {/* Step 1 — Home & Work Area */}
        {step === 1 && (
          <View style={s.stepWrap}>
            <Text style={s.emoji}>📍</Text>
            <Text style={s.title}>{t('onboardingAreaTitle')}</Text>
            <Text style={s.subtitle}>{t('onboardingAreaSubtitle')}</Text>
            <View style={[s.options, { zIndex: 20 }]}>
              <LiveAddressInput
                label={t('homeArea')}
                icon="🏠"
                placeholder={t('addrPlaceholder')}
                selectedArea={homeArea}
                onSelect={setHomeArea}
                onClear={() => setHomeArea(null)}
              />
            </View>
            <View style={s.options}>
              <LiveAddressInput
                label={t('workArea')}
                icon="🏢"
                placeholder={t('addrPlaceholder')}
                selectedArea={workArea}
                onSelect={setWorkArea}
                onClear={() => setWorkArea(null)}
              />
            </View>
          </View>
        )}

        {/* Step 2 — Refueling Style */}
        {step === 2 && (
          <View style={s.stepWrap}>
            <Text style={s.emoji}>🔁</Text>
            <Text style={s.title}>{t('onboardingHabitTitle')}</Text>
            <Text style={s.subtitle}>{t('onboardingHabitSubtitle')}</Text>
            <View style={s.options}>
              {refuelingStyles.map(r => (
                <Pill key={r.value} selected={refStyle === r.value} label={r.label} desc={r.desc} onPress={() => setRefStyle(r.value)} />
              ))}
            </View>
          </View>
        )}

        {/* Step 3 — Optional */}
        {step === 3 && (
          <View style={s.stepWrap}>
            <Text style={s.emoji}>✨</Text>
            <Text style={s.title}>{t('onboardingOptionalTitle')}</Text>
            <Text style={s.subtitle}>{t('onboardingOptionalSubtitle')}</Text>

            <Text style={s.sectionLabel}>🚗 {t('vehicleType')}</Text>
            <View style={s.options}>
              {carTypes.map(c => (
                <Pill key={c.value} selected={carType === c.value} label={c.label} onPress={() => setCarType(c.value === carType ? null : c.value)} />
              ))}
            </View>

            <Text style={[s.sectionLabel, { marginTop: 8 }]}>💰 {t('fullTankCost')}</Text>
            <View style={s.options}>
              {amounts.map(a => (
                <Pill key={a.value} selected={refAmount === a.value} label={a.label} onPress={() => setRefAmount(a.value === refAmount ? null : a.value)} />
              ))}
            </View>

            {/* Optional: full-tank range */}
            <Text style={[s.sectionLabel, { marginTop: 8 }]}>🛣️ {t('fullTankRange')} {t('optionalLabel')}</Text>
            <Text style={s.hint}>{t('onboardingRangeHint')}</Text>
            <View style={rangeS.inputRow}>
              <TextInput
                style={rangeS.input}
                value={totalRangeKm}
                onChangeText={setTotalRangeKm}
                placeholder={t('rangePlaceholder')}
                placeholderTextColor="#4B5563"
                keyboardType="numeric"
                returnKeyType="done"
                accessibilityLabel={t('fullTankRange')}
              />
              <Text style={rangeS.unit}>km</Text>
            </View>
          </View>
        )}

        {/* Step 4 — Current Tank Level (Q&A) */}
        {step === 4 && (
          <View style={s.stepWrap}>
            <Text style={s.emoji}>🛢️</Text>
            <Text style={s.title}>{t('onboardingTankTitle')}</Text>
            <Text style={s.subtitle}>{t('onboardingTankSubtitle')}</Text>

            {/* Big % label */}
            <View style={levelS.box}>
              <Text style={levelS.pct}>{tankPct}%</Text>
              <Text style={levelS.label}>{getTankLevelLabel(tankPct)}</Text>
            </View>

            {/* Combined visual bar + slider — one element via FuelSlider */}
            <FuelSlider
              value={tankPct}
              fillColor={
                tankPct >= 50 ? '#22C55E' : tankPct >= 25 ? '#F59E0B' : '#EF4444'
              }
              step={5}
              onValueChange={setTankPct}
              onSlidingComplete={setTankPct}
            />

            <Text style={levelS.hint}>{t('tankLevelScaleHint')}</Text>
          </View>
        )}

        {/* Continue / Done */}
        <TouchableOpacity
          style={[s.nextBtn, !canProceed && s.nextBtnDim]}
          onPress={next}
          disabled={!canProceed}
          activeOpacity={0.8}
        >
          <Text style={s.nextBtnText}>
            {step < 4 ? t('onboardingNext') : t('onboardingStart')}
          </Text>
        </TouchableOpacity>

        {step === 1 && !homeArea && (
          <Text style={s.hint}>{t('onboardingSearchHint')}</Text>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen:      { flex: 1, backgroundColor: '#0D0F14' },
  content:     { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 48, gap: 24 },
  topBar:      { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', position: 'relative', minHeight: 28 },
  backBtn:     { position: 'absolute', left: 0, paddingHorizontal: 10, paddingVertical: 4 },
  backText:    { color: '#9CA3AF', fontSize: 14, fontWeight: '600' },
  skipBtn:     { position: 'absolute', right: 0, paddingHorizontal: 10, paddingVertical: 4 },
  skipText:    { color: '#6B7280', fontSize: 14, fontWeight: '600' },
  stepWrap:    { gap: 16 },
  emoji:       { fontSize: 40, textAlign: 'center' },
  title:       { color: '#F9FAFB', fontSize: 22, fontWeight: '800', textAlign: 'center', lineHeight: 30 },
  subtitle:    { color: '#9CA3AF', fontSize: 14, textAlign: 'center', lineHeight: 21 },
  sectionLabel:{ color: '#D1D5DB', fontSize: 14, fontWeight: '700' },
  options:     { gap: 10 },
  nextBtn:     { backgroundColor: '#6366F1', borderRadius: 16, paddingVertical: 16, alignItems: 'center', shadowColor: '#6366F1', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  nextBtnDim:  { backgroundColor: 'rgba(99,102,241,0.25)', shadowOpacity: 0, elevation: 0 },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  hint:        { color: '#4B5563', fontSize: 12, textAlign: 'center' },
});

// ── Step 4: Tank Level Slider Styles ──────────────────────────────────────────
const levelS = StyleSheet.create({
  box:    { alignItems: 'center', gap: 4, paddingVertical: 12 },
  pct:    { color: '#F9FAFB', fontSize: 52, fontWeight: '800', letterSpacing: -2 },
  label:  { color: '#9CA3AF', fontSize: 15, fontWeight: '600' },
  track: {
    width: '100%',
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 6,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: '#6366F1',
    borderRadius: 6,
  },
  slider:    { width: '100%', height: 40 },
  // Merged overlay styles (trackWrap + overlay replace standalone slider)
  trackWrap: { position: 'relative', height: 40, justifyContent: 'center' },
  overlay:   { position: 'absolute', left: -8, right: -8, height: 40 },
  hint:      { color: '#4B5563', fontSize: 11, textAlign: 'center' },
});
// ── Step 3: Range Input Styles ────────────────────────────────────────────────
const rangeS = StyleSheet.create({
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  unit: { color: '#6B7280', fontSize: 14, fontWeight: '600' },
});
