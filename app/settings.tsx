// ====================================================
// FuelAmpel — Settings Screen (v3)
//
// UX improvements:
//  - Auto-save inputs on blur / submit (no Save button)
//  - Inline "✓ Saved" feedback — no Alert pop-ups for saves
//  - Full Reset moved to bottom "Danger Zone" section
// ====================================================

import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useUserStore } from '../src/store/userStore';
import { useFuelStore } from '../src/store/fuelStore';
import { formatFuelType } from '../src/utils/formatters';
import {
  FuelType, RefuelingStyle, CarType, LastRefuelAmount, CommonArea,
} from '../src/utils/types';
import { Language } from '../src/utils/i18n';
import { t } from '../src/utils/i18n';
import { LiveAddressInput } from '../src/components/LiveAddressInput';


// ── Constants ─────────────────────────────────────────────────────────────────

const FUEL_TYPES: FuelType[] = ['e5', 'e10', 'diesel'];

const LANGUAGE_OPTIONS: { value: Language; label: string; sublabel: string }[] = [
  { value: 'de', label: 'Deutsch', sublabel: 'Standard' },
  { value: 'en', label: 'English', sublabel: 'English' },
];

const REFUELING_STYLE_VALUES: RefuelingStyle[] = ['nearEmpty', 'cheapest'];
const CAR_TYPE_VALUES: CarType[] = ['small', 'regular', 'large', 'unknown'];
const AMOUNT_VALUES: LastRefuelAmount[] = ['<40', '40-60', '60-80', '80+', 'unknown'];

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

// ── Option pill grid ──────────────────────────────────────────────────────────

function OptionRow<T extends string>({
  options, value, onSelect,
}: { options: { value: T; label: string }[]; value: T | null; onSelect: (v: T) => void }) {
  return (
    <View style={styles.optionGrid}>
      {options.map(o => (
        <TouchableOpacity
          key={o.value}
          style={[styles.optPill, value === o.value && styles.optPillActive]}
          onPress={() => onSelect(o.value)}
        >
          <Text style={[styles.optPillText, value === o.value && styles.optPillTextActive]}>
            {o.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}


// ── Main ─────────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const router = useRouter();
  const {
    fuelType, commonAreas, refuelingStyle, carType, lastRefuelAmount, shadowTank, smartTank,
    language,
    setFuelType, setCommonAreas, setRefuelingStyle, setCarType, setLastRefuelAmount,
    setLanguage,
    recordRefuel, recordSmartRefuel, setAvgConsumption, setTankCapacity, setTotalRangeKm,
    fullReset, initSmartTank,
  } = useUserStore();

  const recomputeDecision = useFuelStore(s => s.recomputeDecision);
  const switchFuelType    = useFuelStore(s => s.switchFuelType);

  const [consumptionInput, setConsumptionInput] = useState(shadowTank.avgConsumptionPer100km.toString());
  const [capacityInput,    setCapacityInput]    = useState(shadowTank.tankCapacityL.toString());
  const [rangeInput,       setRangeInput]       = useState(
    smartTank?.totalRangeKm != null ? smartTank.totalRangeKm.toString() : ''
  );

  // Dirty state: true when user has typed a new value that hasn't been saved yet.
  // Drives the inline '✓' confirm button highlight.
  const [consumptionDirty, setConsumptionDirty] = useState(false);
  const [capacityDirty,    setCapacityDirty]    = useState(false);
  const [rangeDirty,       setRangeDirty]       = useState(false);
  // Global save button state — true whenever any numeric field is dirty
  const [globalDirty,      setGlobalDirty]      = useState(false);
  const [globalSaved,      setGlobalSaved]      = useState(false);
  const globalSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Translated options — re-computed on each render (language reactive via store subscription)
  const REFUELING_STYLE_OPTIONS = [
    { value: 'nearEmpty'  as RefuelingStyle, label: t('whenNearlyEmpty') },
    { value: 'cheapest'   as RefuelingStyle, label: t('bestPriceAlways') },
  ];
  const CAR_TYPE_OPTIONS = [
    { value: 'small'   as CarType, label: t('carSmall') },
    { value: 'regular' as CarType, label: t('carFamily') },
    { value: 'large'   as CarType, label: t('carLarge') },
    { value: 'unknown' as CarType, label: t('carUnknown') },
  ];
  const AMOUNT_OPTIONS = [
    { value: '<40'     as LastRefuelAmount, label: t('below40') },
    { value: '40-60'   as LastRefuelAmount, label: t('from40to60') },
    { value: '60-80'   as LastRefuelAmount, label: t('from60to80') },
    { value: '80+'     as LastRefuelAmount, label: t('above80') },
    { value: 'unknown' as LastRefuelAmount, label: t('dontRemember') },
  ];

  // ── Inline "✓ Saved" feedback — no disruptive Alert pop-ups ──────────────
  const [savedField, setSavedField] = useState<string | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showSaved(field: string) {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    setSavedField(field);
    savedTimerRef.current = setTimeout(() => setSavedField(null), 2000);
  }

  // Local resolved areas (mirrors store, updated on pick)
  const [homeArea, setHomeArea] = useState<CommonArea | null>(commonAreas[0] ?? null);
  const [workArea, setWorkArea] = useState<CommonArea | null>(commonAreas[1] ?? null);
  const [areaDirty, setAreaDirty] = useState(false);

  function updateHome(area: CommonArea) {
    setHomeArea(area);
    setAreaDirty(true);
    setGlobalDirty(true);
  }
  function clearHome() {
    setHomeArea(null);
    setAreaDirty(true);
    setGlobalDirty(true);
  }
  function updateWork(area: CommonArea) {
    setWorkArea(area);
    setAreaDirty(true);
    setGlobalDirty(true);
  }
  function clearWork() {
    setWorkArea(null);
    setAreaDirty(true);
    setGlobalDirty(true);
  }

  // ── Auto-save helpers: validate → save silently → show inline ✓ ──────────

  function saveConsumption() {
    const val = parseFloat(consumptionInput);
    if (isNaN(val) || val < 3 || val > 25) { Alert.alert(t('alertInvalidValue'), t('alertConsumptionRange')); return; }
    setAvgConsumption(val);
    setConsumptionDirty(false);
    showSaved('consumption');
  }

  function saveCapacity() {
    const val = parseFloat(capacityInput);
    if (isNaN(val) || val < 20 || val > 120) { Alert.alert(t('alertInvalidValue'), t('alertCapacityRange')); return; }
    setTankCapacity(val);
    setCapacityDirty(false);
    showSaved('capacity');
  }

  function saveRange() {
    if (rangeInput.trim() === '' || rangeInput.trim() === '0') {
      setTotalRangeKm(null);
      setRangeDirty(false);
      showSaved('range');
      return;
    }
    const val = parseFloat(rangeInput);
    if (isNaN(val) || val < 50 || val > 2000) { Alert.alert(t('alertInvalidValue'), t('alertRangeInputRange')); return; }

    // Bootstrap SmartTank if needed before committing range
    if (!smartTank && homeArea) {
      initSmartTank(homeArea, workArea ?? undefined);
      console.log('[Settings] SmartTank bootstrapped from saveRange.');
    }

    setTotalRangeKm(val);
    setRangeDirty(false);
    showSaved('range');
  }

  // Global save: commits all outstanding dirty fields in one gesture.
  // Called by the fixed header button. Always visible, never scrolls away.
  function handleGlobalSave() {
    let hasError = false;

    // ── 1. Save Gebiete first (must run before Reichweite so SmartTank exists) ──
    if (areaDirty) {
      const areas: CommonArea[] = [];
      if (homeArea) areas.push(homeArea);
      if (workArea) areas.push(workArea);
      setCommonAreas(areas);
      setAreaDirty(false);
      console.log('[Settings] Gebiete saved:', areas.map(a => a.displayName).join(', '));
      // Bootstrap SmartTank for skip-onboarding users.
      // Zustand set() is synchronous, so subsequent setTotalRangeKm sees new smartTank.
      if (!smartTank && homeArea) {
        initSmartTank(homeArea, workArea ?? undefined);
        console.log('[Settings] SmartTank bootstrapped from Settings Gebiete save.');
      }
    }

    // ── 2. Save numeric fields ──────────────────────────────────────────────
    if (consumptionDirty) {
      const val = parseFloat(consumptionInput);
      if (isNaN(val) || val < 3 || val > 25) {
        Alert.alert(t('alertInvalidValue'), t('alertConsumptionRange')); hasError = true;
      } else { setAvgConsumption(val); setConsumptionDirty(false); }
    }
    if (capacityDirty) {
      const val = parseFloat(capacityInput);
      if (isNaN(val) || val < 20 || val > 120) {
        Alert.alert(t('alertInvalidValue'), t('alertCapacityRange')); hasError = true;
      } else { setTankCapacity(val); setCapacityDirty(false); }
    }
    if (rangeDirty) {
      const trimmed = rangeInput.trim();
      if (trimmed === '' || trimmed === '0') {
        setTotalRangeKm(null); setRangeDirty(false);
      } else {
        const val = parseFloat(trimmed);
        if (isNaN(val) || val < 50 || val > 2000) {
          Alert.alert(t('alertInvalidValue'), t('alertRangeInputRange')); hasError = true;
        } else { setTotalRangeKm(val); setRangeDirty(false); }
      }
    }

    // ── 3. Commit + refresh Home decision engine ────────────────────────────
    if (!hasError) {
      setGlobalDirty(false);
      if (globalSavedTimerRef.current) clearTimeout(globalSavedTimerRef.current);
      setGlobalSaved(true);
      globalSavedTimerRef.current = setTimeout(() => setGlobalSaved(false), 2000);
      recomputeDecision();
      console.log('[Settings] Global save committed. Decision recomputed.');
    }
  }

  function handleRefuelingStyleChange(style: RefuelingStyle) {
    setRefuelingStyle(style);
    recomputeDecision();
    console.log('[Settings] RefuelingStyle changed →', style, '— decision recomputed.');
  }

  function handleRefueled() {
    Alert.alert(t('alertResetTankTitle'), t('alertResetTankBody'), [
      { text: t('alertCancel'), style: 'cancel' },
      { text: t('alertYesRefueled'), onPress: () => {
        if (smartTank) {
          recordSmartRefuel(0, 'user_tap');
          console.log('[Settings] SmartTank refuel recorded → level reset to ~100%');
        }
        recordRefuel();
        recomputeDecision();
        showSaved('refuel');
      }},
    ]);
  }

  function confirmFullReset() {
    Alert.alert(t('alertFullResetTitle'), t('alertFullResetBody'), [
      { text: t('alertCancel'), style: 'cancel' },
      { text: t('alertResetEverything'), style: 'destructive', onPress: () => {
        fullReset(); router.replace('/onboarding');
      }},
    ]);
  }

  // Auto-save dirty inputs on page blur (e.g. user types value then switches Tab).
  // Prevents silent data loss — same validation logic as the manual ✓ button.
  useFocusEffect(useCallback(() => {
    return () => {
      // 1. Auto-save areas
      if (areaDirty) {
        const areas: CommonArea[] = [];
        if (homeArea) areas.push(homeArea);
        if (workArea) areas.push(workArea);
        setCommonAreas(areas);
        setAreaDirty(false);
        console.log('[Settings] Auto-saved Gebiete on blur');
        if (!useUserStore.getState().smartTank && homeArea) {
          initSmartTank(homeArea, workArea ?? undefined);
          console.log('[Settings] SmartTank bootstrapped on blur.');
        }
      }

      // 2. Auto-save numeric fields
      if (consumptionDirty) {
        const val = parseFloat(consumptionInput);
        if (!isNaN(val) && val >= 3 && val <= 25) {
          setAvgConsumption(val); setConsumptionDirty(false);
          console.log('[Settings] Auto-saved consumption on blur:', val);
        }
      }
      if (capacityDirty) {
        const val = parseFloat(capacityInput);
        if (!isNaN(val) && val >= 20 && val <= 120) {
          setTankCapacity(val); setCapacityDirty(false);
          console.log('[Settings] Auto-saved capacity on blur:', val);
        }
      }
      if (rangeDirty) {
        const trimmed = rangeInput.trim();
        if (trimmed === '' || trimmed === '0') {
          setTotalRangeKm(null); setRangeDirty(false);
        } else {
          const val = parseFloat(trimmed);
          if (!isNaN(val) && val >= 50 && val <= 2000) {
            // Bootstrap here as well just in case they only touched range
            if (!useUserStore.getState().smartTank && homeArea) initSmartTank(homeArea, workArea ?? undefined);
            setTotalRangeKm(val); setRangeDirty(false);
            console.log('[Settings] Auto-saved range on blur:', val);
          }
        }
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaDirty, homeArea, workArea, consumptionDirty, consumptionInput, capacityDirty, capacityInput, rangeDirty, rangeInput]));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>

      {/* Fixed header Save button — same level as 'Einstellungen' title, never scrolls away */}
      <Stack.Screen
        options={{
          headerRight: () => (
            <TouchableOpacity
              onPress={handleGlobalSave}
              disabled={!globalDirty}
              style={{ paddingHorizontal: 4, paddingVertical: 4 }}
              accessibilityLabel="Alle Änderungen speichern"
            >
              <Text style={[styles.headerSaveBtn, !globalDirty && styles.headerSaveBtnDisabled]}>
                {globalSaved ? '✓' : 'Speichern'}
              </Text>
            </TouchableOpacity>
          ),
        }}
      />

      <View style={styles.pageNote}>
        <Text style={styles.pageNoteText}>{t('settingsAutosaveHint')}</Text>
      </View>

      {/* Language / Sprache */}
      <Section title={t('language')}>
        <View style={styles.tabRow}>
          {LANGUAGE_OPTIONS.map(o => (
            <TouchableOpacity
              key={o.value}
              style={[styles.tab, language === o.value && styles.tabActive]}
              onPress={() => setLanguage(o.value)}
              accessibilityLabel={`${t('language')}: ${o.label}`}
            >
              <Text style={[styles.tabText, language === o.value && styles.tabTextA]}>
                {o.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Section>

      {/* Fuel Type */}
      <Section title={t('fuelType')}>
        <View style={styles.tabRow}>
          {FUEL_TYPES.map(ft => (
            <TouchableOpacity key={ft} style={[styles.tab, fuelType === ft && styles.tabActive]} onPress={() => {
              setFuelType(ft);
              switchFuelType(ft);
              recomputeDecision();
            }}>
              <Text style={[styles.tabText, fuelType === ft && styles.tabTextA]}>{formatFuelType(ft)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Section>

      {/* Common Area */}
      <Section title={t('areas')}>
        <LiveAddressInput
          label={t('homeArea')}
          icon="🏠"
          placeholder={t('addrPlaceholder')}
          selectedArea={homeArea}
          onSelect={updateHome}
          onClear={clearHome}
        />
        <LiveAddressInput
          label={t('workArea')}
          icon="🏢"
          placeholder={t('addrPlaceholder')}
          selectedArea={workArea}
          onSelect={updateWork}
          onClear={clearWork}
        />
      </Section>

      {/* Refueling Style */}
      <Section title={t('refuelingStyle')}>
        <OptionRow<RefuelingStyle> options={REFUELING_STYLE_OPTIONS} value={refuelingStyle} onSelect={handleRefuelingStyleChange} />
      </Section>

      {/* Car Type */}
      <Section title={t('vehicleType')}>
        <OptionRow<CarType> options={CAR_TYPE_OPTIONS} value={carType} onSelect={setCarType} />
      </Section>

      {/* Full Tank Cost */}
      <Section title={t('fullTankCost')}>
        <OptionRow<LastRefuelAmount> options={AMOUNT_OPTIONS} value={lastRefuelAmount} onSelect={setLastRefuelAmount} />
      </Section>

      {/* Shadow Tank — auto-save inputs */}
      <Section title={t('shadowTank')}>

        {/* Avg Consumption */}
        <View style={styles.settingRow}>
          <View style={styles.settingLabelRow}>
            <Text style={styles.settingLabel}>{t('avgConsumption')}</Text>
            {savedField === 'consumption' && <Text style={styles.savedHint}>{t('saved')}</Text>}
          </View>
          <TextInput
            style={styles.input}
            value={consumptionInput}
            onChangeText={(v) => { setConsumptionInput(v); setConsumptionDirty(true); setGlobalDirty(true); }}
            keyboardType="decimal-pad"
            returnKeyType="done"
            onEndEditing={saveConsumption}
            onSubmitEditing={saveConsumption}
            placeholderTextColor="#4B5563"
            accessibilityLabel={t('avgConsumption')}
          />
          {consumptionDirty && (
            <TouchableOpacity
              style={styles.applyBtn}
              onPress={saveConsumption}
              accessibilityLabel={t('saveConsumptionA11y')}
            >
              <Text style={styles.applyBtnText}>{t('applyBtn')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Tank Capacity */}
        <View style={styles.settingRow}>
          <View style={styles.settingLabelRow}>
            <Text style={styles.settingLabel}>{t('tankCapacity')}</Text>
            {savedField === 'capacity' && <Text style={styles.savedHint}>{t('saved')}</Text>}
          </View>
          <TextInput
            style={styles.input}
            value={capacityInput}
            onChangeText={(v) => { setCapacityInput(v); setCapacityDirty(true); setGlobalDirty(true); }}
            keyboardType="decimal-pad"
            returnKeyType="done"
            onEndEditing={saveCapacity}
            onSubmitEditing={saveCapacity}
            placeholderTextColor="#4B5563"
            accessibilityLabel={t('tankCapacity')}
          />
          {capacityDirty && (
            <TouchableOpacity
              style={styles.applyBtn}
              onPress={saveCapacity}
              accessibilityLabel={t('saveTankCapacityA11y')}
            >
              <Text style={styles.applyBtnText}>{t('applyBtn')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Range on full tank */}
        <View style={styles.settingRow}>
          <View style={styles.settingLabelRow}>
            <Text style={styles.settingLabel}>
            {t('fullTankRange')}{'  '}<Text style={{ color: '#4B5563' }}>{t('optionalLabel')}</Text>
          </Text>
            {savedField === 'range' && <Text style={styles.savedHint}>{t('saved')}</Text>}
          </View>
          <Text style={{ color: '#6B7280', fontSize: 11, marginBottom: 4 }}>
            {t('fullTankRangeHint')}
          </Text>
          <TextInput
            style={styles.input}
            value={rangeInput}
            onChangeText={(v) => { setRangeInput(v); setRangeDirty(true); setGlobalDirty(true); }}
            keyboardType="numeric"
            placeholder={t('rangePlaceholder')}
            placeholderTextColor="#4B5563"
            returnKeyType="done"
            onEndEditing={saveRange}
            onSubmitEditing={saveRange}
            accessibilityLabel={t('fullTankRange')}
          />
          {rangeDirty && (
            <TouchableOpacity
              style={styles.applyBtn}
              onPress={saveRange}
              accessibilityLabel={t('saveRangeA11y')}
            >
              <Text style={styles.applyBtnText}>{t('applyBtn')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Refuel reset button */}
        <Pressable
          style={({ pressed }) => [styles.refuelBtn, pressed && { opacity: 0.7 }]}
          onPress={handleRefueled}
          accessibilityLabel={t('markRefueledA11y')}
        >
          <Text style={styles.refuelBtnText}>
            {savedField === 'refuel' ? t('tankReset') : t('refuelReset')}
          </Text>
        </Pressable>

      </Section>

      {/* About */}
      <Section title={t('about')}>
        <Text style={styles.aboutText}>{t('aboutBody')}</Text>
        <Text style={styles.creditText}>{t('aboutCredit')}</Text>
      </Section>

      {/* ── DANGER ZONE — Full Reset always at bottom ── */}
      <Section title={t('dangerZone')}>
        <TouchableOpacity style={[styles.resetBtn, styles.resetBtnDanger]} onPress={confirmFullReset} accessibilityLabel={t('fullReset')}>
          <Text style={[styles.resetBtnText, styles.resetBtnTextDanger]}>{t('fullReset')}</Text>
          <Text style={styles.resetBtnDesc}>{t('fullResetDesc')}</Text>
        </TouchableOpacity>
      </Section>

    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Header save button
  headerSaveBtn:        { color: '#6366F1', fontSize: 16, fontWeight: '700' },
  headerSaveBtnDisabled:{ color: '#4B5563' },

  screen:   { flex: 1, backgroundColor: '#0D0F14' },
  content:  { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 60, gap: 24 },
  pageNote: { backgroundColor: 'rgba(99,102,241,0.08)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(99,102,241,0.18)', paddingHorizontal: 14, paddingVertical: 12 },
  pageNoteText: { color: '#A5B4FC', fontSize: 12, lineHeight: 18 },

  section:      { gap: 10 },
  sectionTitle: { color: '#6B7280', fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  sectionBody:  { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', padding: 16, gap: 14 },

  tabRow:      { flexDirection: 'row', gap: 8 },
  tab:         { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  tabActive:   { backgroundColor: 'rgba(99,102,241,0.2)', borderColor: '#6366F1' },
  tabText:     { color: '#6B7280', fontSize: 13, fontWeight: '600' },
  tabTextA:    { color: '#A5B4FC' },

  optionGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optPill:           { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', backgroundColor: 'rgba(255,255,255,0.04)' },
  optPillActive:     { backgroundColor: 'rgba(99,102,241,0.18)', borderColor: '#6366F1' },
  optPillText:       { color: '#6B7280', fontSize: 12, fontWeight: '600' },
  optPillTextActive: { color: '#A5B4FC' },

  settingRow:      { gap: 6 },
  settingLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  settingLabel:    { color: '#9CA3AF', fontSize: 13 },
  savedHint:       { color: '#4ADE80', fontSize: 11, fontWeight: '700', backgroundColor: 'rgba(34,197,94,0.12)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.24)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  input:           { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', color: '#F9FAFB', paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },

  // Inline apply button: appears beside numeric inputs when the field is dirty (value changed)
  applyBtn:        { marginTop: 6, alignSelf: 'flex-end', backgroundColor: 'rgba(99,102,241,0.2)', borderRadius: 8, borderWidth: 1, borderColor: '#6366F1', paddingHorizontal: 18, paddingVertical: 8 },
  applyBtnText:    { color: '#A5B4FC', fontWeight: '700', fontSize: 14 },

  refuelBtn:     { backgroundColor: 'rgba(34,197,94,0.1)', borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)', marginTop: 4 },
  refuelBtnText: { color: '#22C55E', fontWeight: '700', fontSize: 14 },

  resetBtn:           { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', gap: 3 },
  resetBtnDanger:     { borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.06)' },
  resetBtnText:       { color: '#E5E7EB', fontSize: 14, fontWeight: '700' },
  resetBtnTextDanger: { color: '#FCA5A5' },
  resetBtnDesc:       { color: '#6B7280', fontSize: 12 },

  aboutText:  { color: '#6B7280', fontSize: 13, lineHeight: 20 },
  creditText: { color: '#4B5563', fontSize: 12, marginTop: 4 },
});
