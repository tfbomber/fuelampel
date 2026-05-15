// ====================================================
// FuelAmpel — Onboarding Screen (Phase 3 dual-mode)
//
// Step 0 (Both):    Mode Selection (Basis / Smart Tank)
// Step 1 (Both):    Fuel Type
//
// Basis path:
//   Step 1 → request GPS. If granted → auto-complete.
//             If denied  → Step 2 (PLZ input) → complete.
//
// Smart Tank path:
//   Step 2: Home & Work address (LiveAddressInput)
//   Step 3: Commute Days
//   Step 4: Initial Tank Level
// ====================================================

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { ensureNotificationPermission } from '../src/utils/notificationPermission';
import { useUserStore } from '../src/store/userStore';
import { useFuelStore } from '../src/store/fuelStore';
import {
  FuelType, RefuelingStyle, CarType, CommonArea,
} from '../src/utils/types';
import { t } from '../src/utils/i18n';
import { LiveAddressInput } from '../src/components/LiveAddressInput';
import { FuelSlider } from '../src/components/FuelSlider';
import { geocodePLZ } from '../src/utils/geocoding';

// ── Option metadata ───────────────────────────────────────────────────────────

const FUEL_TYPES: { value: FuelType; label: string }[] = [
  { value: 'e5',     label: 'Super' },
  { value: 'e10',    label: 'Super E10' },
  { value: 'diesel', label: 'Diesel' },
];

function getCarTypes(): { value: CarType; label: string }[] {
  return [
    { value: 'small', label: t('carSmall') },
    { value: 'regular', label: t('carFamily') },
    { value: 'large', label: t('carLarge') },
    { value: 'unknown', label: t('carUnknown') },
  ];
}



function getTankLevelLabel(pct: number): string {
  if (pct >= 75) return t('tankLevelMostlyFull');
  if (pct >= 40) return t('tankLevelHalf');
  if (pct >= 15) return t('tankLevelLow');
  return t('tankLevelNearlyEmpty');
}

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
  const storeRangeKm = useUserStore(s => s.smartTank?.totalRangeKm ?? null);

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
            {storeRangeKm != null && storeRangeKm > 0 && (
              <Text style={levelS.kmHint}>≈ {Math.round((pct / 100) * storeRangeKm)} km</Text>
            )}
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
  const { completeOnboarding } = useUserStore();

  // ── SmartTank-only init mode (existing users after update) ────────────
  if (mode === 'smartTankInit') {
    return (
      <SmartTankInitScreen
        onDone={async (pct) => {
          const store = useUserStore.getState();
          if (!store.hasCompletedOnboarding) {
            store.completeOnboarding({
              fuelType: 'e5',
              commonAreas: [],
              refuelingStyle: null,
              carType: null,
            });
          }
          const home = store.commonAreas[0] || { plz: '00000', displayName: 'GPS Default' };
          const work = store.commonAreas[1];
          store.initSmartTank(home, work, pct);
          useFuelStore.getState().recomputeDecision();
          await ensureNotificationPermission();
          router.replace('/(tabs)');
        }}
      />
    );
  }

  // ── Full onboarding flow (new users) ───────────────────────────────────

  const [step, setStep] = useState(0);
  const [modeSelection, setModeSelection] = useState<'basis'|'smart'|null>(null);
  const [fuelType, setFuelType] = useState<FuelType>('e5');
  const [plzFallback, setPlzFallback] = useState('');
  const [gpsDenied, setGpsDenied] = useState(false);
  
  // Smart Tank fields
  const [homeArea, setHomeArea] = useState<CommonArea | null>(null);
  const [workArea, setWorkArea] = useState<CommonArea | null>(null);
  const [commuteDays, setCommuteDays] = useState('5');
  const [tankPct, setTankPct] = useState(50);

  const canProceed =
    step === 0 ? modeSelection !== null :
    step === 1 ? true : // fuelType always has default
    step === 2 && modeSelection === 'basis' ? plzFallback.length >= 5 :
    step === 2 && modeSelection === 'smart' ? homeArea !== null :
    step === 3 && modeSelection === 'smart' ? parseInt(commuteDays, 10) >= 1 && parseInt(commuteDays, 10) <= 7 :
    true;

  async function next() {
    if (step === 0) {
      setStep(1);
      return;
    }
    
    if (modeSelection === 'basis') {
      if (step === 1) {
        // BUG-4 FIX: Only request GPS once. If already denied (gpsDenied flag),
        // go straight to PLZ step instead of re-triggering the permission dialog.
        if (gpsDenied) {
          setStep(2);
          return;
        }
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          // BUG-4 FIX: Actually get the GPS coordinates and store as homeArea
          try {
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const { reverseGeocode } = await import('../src/utils/geocoding');
            const suggestion = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
            await handleBasicModeOnly(undefined, suggestion ?? undefined);
          } catch {
            // GPS obtained permission but failed to get position — proceed without coords
            await handleBasicModeOnly();
          }
        } else {
          setGpsDenied(true);
          setStep(2); // fallback to PLZ
        }
        return;
      }
      if (step === 2) {
        await handleBasicModeOnly(plzFallback);
        return;
      }
    } else {
      if (step < 4) {
        setStep(s => s + 1);
        return;
      }
      await commitSmartTanken();
    }
  }

  // BUG-2+BUG-4 FIX: gpsArea is an AddressSuggestion from reverseGeocode (GPS granted path)
  async function handleBasicModeOnly(fallbackPlz?: string, gpsArea?: { displayName: string; plz?: string; loc: { lat: number; lng: number } }) {
    const areas: CommonArea[] = [];

    if (gpsArea) {
      // GPS path: use resolved coordinates directly
      areas.push({
        plz: gpsArea.plz ?? '',
        displayName: gpsArea.displayName,
        loc: gpsArea.loc,
      });
    } else if (fallbackPlz) {
      // PLZ fallback path: geocode the entered PLZ
      const loc = await geocodePLZ(fallbackPlz);
      if (!loc) {
        Alert.alert(t('errorTitle'), t('plzNotFound'));
        return;
      }
      areas.push({
        plz: fallbackPlz,
        displayName: fallbackPlz,
        loc,
      });
    }
    // If neither, commonAreas stays empty; useDecision will use GPS directly on the home tab

    // UX-2 FIX: skipSmartTankSetup() sets both hasCompletedOnboarding=true
    // AND hasSkippedSmartTankSetup=true in one atomic call. completeOnboarding()
    // is NOT called here to avoid the semantic conflict (both set hasCompletedOnboarding).
    // We set fuelType and commonAreas separately via their own store actions.
    const store = useUserStore.getState();
    store.setIsSmartTankenEnabled(false);
    store.setFuelType(fuelType);
    if (areas.length > 0) store.setCommonAreas(areas);
    store.skipSmartTankSetup(); // sets hasCompletedOnboarding + hasSkippedSmartTankSetup

    useFuelStore.getState().recomputeDecision();
    await ensureNotificationPermission();
    router.replace('/(tabs)');
  }

  async function commitSmartTanken() {
    const areas: CommonArea[] = [];
    if (homeArea) areas.push(homeArea);
    if (workArea) areas.push(workArea);
    
    useUserStore.getState().setIsSmartTankenEnabled(true);
    useUserStore.getState().setCommuteDaysInput(parseInt(commuteDays, 10) || 5);

    completeOnboarding({
      fuelType, commonAreas: areas,
      refuelingStyle: null, carType: null, // Removed from UI, rely on defaults & BiasTracker
      initialPct: tankPct,
    });
    
    useFuelStore.getState().recomputeDecision();
    await ensureNotificationPermission();
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
        <View style={s.topBar}>
          {step > 0 && (
            <TouchableOpacity onPress={() => setStep(s => s - 1)} style={s.backBtn}>
              <Text style={s.backText}>{t('onboardingBack')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Step 0 — Mode Selection */}
        {step === 0 && (
          <View style={s.stepWrap}>
            <Text style={s.emoji}>👋</Text>
            <Text style={s.title}>{t('onboardingModeTitle')}</Text>
            
            <View style={{ gap: 16, marginTop: 24 }}>
              <Pill 
                selected={modeSelection === 'basis'} 
                label={t('onboardingModeBasisTitle')} 
                desc={t('onboardingModeBasisDesc')} 
                onPress={() => setModeSelection('basis')} 
              />
              <Pill 
                selected={modeSelection === 'smart'} 
                label={t('onboardingModeSmartTitle')} 
                desc={t('onboardingModeSmartDesc')} 
                onPress={() => setModeSelection('smart')} 
              />
            </View>
          </View>
        )}

        {/* Step 1 — Fuel Type */}
        {step === 1 && (
          <View style={s.stepWrap}>
            <Text style={s.emoji}>⛽</Text>
            <Text style={s.title}>{t('onboardingFuelTitle')}</Text>
            <Text style={s.subtitle}>{t('onboardingFuelSubtitle')}</Text>
            <View style={s.options}>
              {FUEL_TYPES.map(f => (
                <Pill key={f.value} selected={fuelType === f.value} label={f.label} onPress={() => setFuelType(f.value)} />
              ))}
            </View>
          </View>
        )}

        {/* Step 2 (Basis) — GPS Denied Fallback */}
        {step === 2 && modeSelection === 'basis' && (
          <View style={s.stepWrap}>
            <Text style={s.emoji}>📍</Text>
            <Text style={s.title}>{t('onboardingBasisGpsDenied')}</Text>
            <View style={rangeS.inputRow}>
              <TextInput
                style={rangeS.input}
                value={plzFallback}
                onChangeText={setPlzFallback}
                placeholder={t('plzPlaceholder')}
                placeholderTextColor="#4B5563"
                keyboardType="numeric"
                maxLength={5}
                returnKeyType="done"
              />
            </View>
          </View>
        )}

        {/* Step 2 (Smart) — Home & Work Area */}
        {step === 2 && modeSelection === 'smart' && (
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
                otherArea={workArea}
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
                otherArea={homeArea}
              />
            </View>
          </View>
        )}

        {/* Step 3 (Smart) — Commute Days */}
        {step === 3 && modeSelection === 'smart' && (
          <View style={s.stepWrap}>
            <Text style={s.emoji}>🔁</Text>
            <Text style={s.title}>{t('onboardingHabitTitle')}</Text>
            <Text style={s.subtitle}>{t('onboardingHabitSubtitle')}</Text>

            <Text style={[s.sectionLabel, { marginTop: 8 }]}>🛣️ Wie viele Tage fährst du pro Woche zur Arbeit?</Text>
            <View style={rangeS.inputRow}>
              <TextInput
                style={rangeS.input}
                value={commuteDays}
                onChangeText={setCommuteDays}
                placeholder="z.B. 5"
                placeholderTextColor="#4B5563"
                keyboardType="numeric"
                returnKeyType="done"
              />
              <Text style={rangeS.unit}>Tage</Text>
            </View>
          </View>
        )}

        {/* Step 4 (Smart) — Current Tank Level */}
        {step === 4 && modeSelection === 'smart' && (
          <View style={s.stepWrap}>
            <Text style={s.emoji}>🛢️</Text>
            <Text style={s.title}>{t('onboardingTankTitle')}</Text>
            <Text style={s.subtitle}>{t('onboardingTankSubtitle')}</Text>

            <View style={levelS.box}>
              <Text style={levelS.pct}>{tankPct}%</Text>
              <Text style={levelS.label}>{getTankLevelLabel(tankPct)}</Text>
            </View>

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
          style={[s.nextBtn, !canProceed && s.nextBtnDim, { marginTop: 24 }]}
          onPress={next}
          disabled={!canProceed}
          activeOpacity={0.8}
        >
          <Text style={s.nextBtnText}>
            {(modeSelection === 'basis' && step === 1) || (modeSelection === 'smart' && step === 4) || (modeSelection === 'basis' && step === 2)
              ? t('onboardingStart') : t('onboardingNext')}
          </Text>
        </TouchableOpacity>

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
  kmHint:    { color: '#6366F1', fontSize: 14, fontWeight: '600', marginTop: 2 },
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
