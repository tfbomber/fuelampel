// ====================================================
// FuelAmpel — Onboarding Screen
//
// Step 0 (Must):  Fuel Type
// Step 1 (Must):  Home & Work area — address/PLZ autocomplete with dropdown
// Step 2 (Must):  Refueling Style
// Step 3 (Optional, skippable): Car Type + Last Refuel Amount
// ====================================================

import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, FlatList, Keyboard,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useUserStore } from '../src/store/userStore';
import { useFuelStore } from '../src/store/fuelStore';
import {
  FuelType, RefuelingStyle, CarType, LastRefuelAmount, CommonArea,
} from '../src/utils/types';
import { searchAddressWithFallback, AddressSuggestion } from '../src/utils/geocoding';
import { FuelSlider } from '../src/components/FuelSlider';

// ── Option metadata ───────────────────────────────────────────────────────────

const FUEL_TYPES: { value: FuelType; label: string }[] = [
  { value: 'e5',     label: 'Super E5' },
  { value: 'e10',    label: 'Super E10' },
  { value: 'diesel', label: 'Diesel' },
];

const REFUELING_STYLES: { value: RefuelingStyle; label: string; desc: string }[] = [
  { value: 'nearEmpty',  label: 'When nearly empty', desc: 'I wait until the tank is low' },
  { value: 'cheapest',   label: 'Best price always', desc: 'I actively look for the cheapest' },
];

const CAR_TYPES: { value: CarType; label: string }[] = [
  { value: 'small',   label: 'Small car  (< 45 L)' },
  { value: 'regular', label: 'Family car  (45–65 L)' },
  { value: 'large',   label: 'Large car / SUV  (65 L+)' },
  { value: 'unknown', label: 'Not sure' },
];

const AMOUNTS: { value: LastRefuelAmount; label: string }[] = [
  { value: '<40',     label: '< 40 €' },
  { value: '40-60',   label: '40 – 60 €' },
  { value: '60-80',   label: '60 – 80 €' },
  { value: '80+',     label: '80 € +' },
  { value: 'unknown', label: "Don't remember" },
];

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

// ── Address Autocomplete Input ────────────────────────────────────────────────
// DESIGN: No debounce / auto-search on keystroke.
// The user types their full address, then:
//   (a) taps the 🔍 button, OR
//   (b) presses the keyboard "Search" key.
// A single focused network request fires (Plan A → Plan B cascade, max 6 s).
// This eliminates Nominatim rate-limit bans from rapid keystroke requests.

type SearchState = 'idle' | 'loading' | 'no_results' | 'error';

interface AutocompleteInputProps {
  label: string;
  icon: string;
  placeholder: string;
  selectedArea: CommonArea | null;
  onSelect: (area: CommonArea) => void;
  onClear: () => void;
}

function AddressAutocompleteInput({
  label, icon, placeholder, selectedArea, onSelect, onClear,
}: AutocompleteInputProps) {
  const [query,       setQuery]       = useState(selectedArea?.displayName ?? '');
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [open,        setOpen]        = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canSearch  = query.trim().length >= 3;
  const isLoading  = searchState === 'loading';
  const isResolved = selectedArea !== null;

  // ─── Trigger search ───────────────────────────────────────────────────────
  // Called on 🔍 button tap, keyboard Search/Return key, OR auto-debounce (800ms after stop typing).
  // Runs Plan A (Nominatim, 3 s) then Plan B (Photon, 3 s) automatically.
  // queryOverride: pass the raw text value directly to avoid stale React state closure in debounce.
  async function triggerSearch(queryOverride?: string) {
    const q = (queryOverride ?? query).trim();
    if (q.length < 3) return;
    // Always cancel the previous in-flight request — no stale isLoading guard needed.
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }

    Keyboard.dismiss();
    setSearchState('loading');
    setOpen(false);
    setSuggestions([]);

    const ac = new AbortController();
    abortRef.current = ac;
    const { results, failed } = await searchAddressWithFallback(q, ac.signal);
    if (ac.signal.aborted) return; // user cancelled — don't update state
    abortRef.current = null;

    if (results.length > 0) {
      setSuggestions(results);
      setOpen(true);
      setSearchState('idle');
    } else {
      setSearchState(failed ? 'error' : 'no_results');
    }
  }

  function pickSuggestion(s: AddressSuggestion) {
    const area: CommonArea = { plz: '', displayName: s.shortName, loc: s.loc };
    setQuery(s.shortName);
    setSuggestions([]);
    setOpen(false);
    setSearchState('idle');
    Keyboard.dismiss();
    onSelect(area);
  }

  function handleClear() {
    // Cancel any in-flight request before resetting — otherwise the request
    // could complete and overwrite the cleared state.
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    setQuery('');
    setSuggestions([]);
    setOpen(false);
    setSearchState('idle');
    onClear();
  }

  const statusMsg =
    searchState === 'error'      ? '⚠️  Netzwerkfehler — beide Server nicht erreichbar' :
    searchState === 'no_results' ? `Keine Ergebnisse — Schreibweise prüfen oder per GPS überspringen` :
    null;

  return (
    <View style={acStyles.container}>
      <Text style={acStyles.label}>
        <Text style={acStyles.icon}>{icon} </Text>
        {label}
      </Text>

      <View style={[acStyles.inputWrap, isResolved && acStyles.inputWrapOk]}>
        <TextInput
          style={acStyles.input}
          value={query}
          onChangeText={(t) => {
            setQuery(t);
            // Always reset unconditionally — avoids stale-closure miss when
            // the user edits text while a request is already in-flight.
            setSearchState('idle');
            // Cancel the in-flight request immediately so it can't overwrite
            // state after the user has already changed the query.
            if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
            setSuggestions([]);
            setOpen(false);
            // Auto-search debounce: fire 800ms after user stops typing.
            // Capture the raw text to avoid stale React state in the closure.
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
            if (t.trim().length >= 3) {
              debounceTimerRef.current = setTimeout(() => triggerSearch(t.trim()), 800);
            }
          }}
          placeholder={placeholder}
          placeholderTextColor="#4B5563"
          returnKeyType="search"
          onSubmitEditing={() => triggerSearch()}
          onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
          onBlur={() => {
            // Cancel debounce + in-flight request when the user moves focus away.
            if (debounceTimerRef.current) { clearTimeout(debounceTimerRef.current); debounceTimerRef.current = null; }
            if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
            setSearchState('idle');
            setTimeout(() => setOpen(false), 200);
          }}
          accessibilityLabel={label}
        />
        <View style={acStyles.endAdornment}>
          {isLoading   && <ActivityIndicator size="small" color="#6366F1" />}
          {isResolved  && !isLoading && <Text style={acStyles.checkmark}>✓</Text>}
          {!isResolved && !isLoading && query.length > 0 && (
            <TouchableOpacity onPress={handleClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={acStyles.clearBtn}>✕</Text>
            </TouchableOpacity>
          )}
          {/* 🔍 search button — only shown when there's enough text and not yet resolved */}
          {canSearch && !isLoading && !isResolved && (
            <TouchableOpacity
              onPress={() => triggerSearch()}
              style={acStyles.searchBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Search address"
            >
              <Text style={acStyles.searchBtnText}>🔍</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Error / no-results inline feedback */}
      {statusMsg && <Text style={acStyles.statusMsg}>{statusMsg}</Text>}

      {/* Dropdown */}
      {open && (
        <View style={acStyles.dropdown}>
          <FlatList
            data={suggestions}
            keyExtractor={(_, i) => i.toString()}
            keyboardShouldPersistTaps="always"
            scrollEnabled={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={acStyles.suggestion}
                onPress={() => pickSuggestion(item)}
                activeOpacity={0.7}
              >
                <Text style={acStyles.suggestionShort} numberOfLines={1}>{item.shortName}</Text>
                <Text style={acStyles.suggestionFull} numberOfLines={1}>{item.displayName}</Text>
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={acStyles.sep} />}
          />
        </View>
      )}
    </View>
  );
}

const acStyles = StyleSheet.create({
  container:     { zIndex: 10, gap: 6 },
  label:         { color: '#D1D5DB', fontSize: 14, fontWeight: '700' },
  icon:          { fontSize: 16 },
  inputWrap:     { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 14, paddingVertical: 4 },
  inputWrapOk:   { borderColor: '#22C55E' },
  input:         { flex: 1, color: '#F9FAFB', fontSize: 15, paddingVertical: 11 },
  endAdornment:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkmark:     { color: '#22C55E', fontSize: 18, fontWeight: '700' },
  clearBtn:      { color: '#4B5563', fontSize: 14, fontWeight: '700' },
  searchBtn:     { backgroundColor: 'rgba(99,102,241,0.15)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(99,102,241,0.3)' },
  searchBtnText: { fontSize: 14 },
  statusMsg:     { color: '#F87171', fontSize: 12, paddingHorizontal: 2, lineHeight: 18 },
  dropdown: {
    marginTop: 4,
    backgroundColor: '#1E2130',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  suggestion:      { paddingHorizontal: 14, paddingVertical: 11, gap: 2 },
  suggestionShort: { color: '#F9FAFB', fontSize: 14, fontWeight: '700' },
  suggestionFull:  { color: '#6B7280', fontSize: 11 },
  sep:             { height: 1, backgroundColor: 'rgba(255,255,255,0.05)' },
});

// ─────────────────────────────────────────────────────────────────────────────
// SmartTankInitScreen  (existing users — single-step setup)
// Shows just the fuel-level slider + car type selector.
// ─────────────────────────────────────────────────────────────────────────────

function SmartTankInitScreen({ onDone }: { onDone: (pct: number) => void }) {
  const [pct,     setPct]     = useState(50);
  const [carType, setCarType] = useState<CarType | null>(null);

  return (
    <View style={s.screen}>
      <ScrollView
        contentContainerStyle={[s.content, { paddingTop: 80 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text style={s.emoji}>🛢️</Text>
        <Text style={s.title}>Ein kurzes Setup</Text>
        <Text style={s.subtitle}>
          Wir haben eine neue intelligente Tankschätzung.{'\n'}
          Nur zwei kurze Fragen — dauert 20 Sekunden.
        </Text>

        {/* Tank level slider */}
        <View style={{ gap: 12, marginTop: 8 }}>
          <Text style={s.sectionLabel}>⛽ Wie voll ist dein Tank gerade?</Text>

          <View style={levelS.box}>
            <Text style={levelS.pct}>{pct}%</Text>
            <Text style={levelS.label}>
              {pct >= 75 ? '🟢 Gut gefüllt'
                : pct >= 40 ? '🟡 Halb voll'
                : pct >= 15 ? '🟠 Wird knapp'
                : '🔴 Fast leer'}
            </Text>
          </View>

          <FuelSlider
            value={pct}
            fillColor={pct >= 50 ? '#22C55E' : pct >= 25 ? '#F59E0B' : '#EF4444'}
            step={5}
            onValueChange={setPct}
            onSlidingComplete={setPct}
          />
          <Text style={levelS.hint}>0% = leer  •  50% = halb  •  100% = voll</Text>
        </View>

        {/* Car type (reused for capacity estimate) */}
        <View style={{ gap: 10, marginTop: 8 }}>
          <Text style={s.sectionLabel}>🚗 Fahrzeugtyp (für Tankgröße)</Text>
          {CAR_TYPES.map(c => (
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
          <Text style={s.nextBtnText}>Fertig — Los geht's ✓</Text>
        </TouchableOpacity>
        <Text style={[s.hint, { marginTop: 8 }]}>
          Du kannst alles jederzeit in den Einstellungen anpassen.
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
  const { completeOnboarding, adjustLevelManually, initSmartTank, commonAreas } = useUserStore();

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
          store.adjustLevelManually(pct);
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
    completeOnboarding({ fuelType, commonAreas: areas, refuelingStyle: refStyle, carType, lastRefuelAmount: refAmount });
    adjustLevelManually(tankPct);
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
    completeOnboarding({ fuelType, commonAreas: areas, refuelingStyle: refStyle, carType, lastRefuelAmount: refAmount });
    // Apply user-stated initial tank level
    adjustLevelManually(tankPct);
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
              <Text style={s.backText}>← Back</Text>
            </TouchableOpacity>
          )}
          {(step === 3) && (
            <TouchableOpacity onPress={commit} style={s.skipBtn}>
              <Text style={s.skipText}>Skip</Text>
            </TouchableOpacity>
          )}
          {(step === 1 || step === 2) && (
            <TouchableOpacity onPress={handleSkipAll} style={s.skipBtn}>
              <Text style={s.skipText}>Überspringen</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Step 0 — Fuel Type */}
        {step === 0 && (
          <View style={s.stepWrap}>
            <Text style={s.emoji}>⛽</Text>
            <Text style={s.title}>Your default fuel type?</Text>
            <Text style={s.subtitle}>Used as default when searching stations</Text>
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
            <Text style={s.title}>Where do you usually refuel?</Text>
            <Text style={s.subtitle}>Enter an address, city, or postal code.{'\n'}We'll find stations near those areas.</Text>
            <View style={[s.options, { zIndex: 20 }]}>
              <AddressAutocompleteInput
                label="Home area"
                icon="🏠"
                placeholder="e.g. 80331 or München Zentrum"
                selectedArea={homeArea}
                onSelect={setHomeArea}
                onClear={() => setHomeArea(null)}
              />
            </View>
            <View style={s.options}>
              <AddressAutocompleteInput
                label="Work area  (optional)"
                icon="🏢"
                placeholder="e.g. 10115 or Berlin Mitte"
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
            <Text style={s.title}>Your refueling habit?</Text>
            <Text style={s.subtitle}>Helps us decide when to recommend filling up</Text>
            <View style={s.options}>
              {REFUELING_STYLES.map(r => (
                <Pill key={r.value} selected={refStyle === r.value} label={r.label} desc={r.desc} onPress={() => setRefStyle(r.value)} />
              ))}
            </View>
          </View>
        )}

        {/* Step 3 — Optional */}
        {step === 3 && (
          <View style={s.stepWrap}>
            <Text style={s.emoji}>✨</Text>
            <Text style={s.title}>Help us optimise faster</Text>
            <Text style={s.subtitle}>Both optional — skip anytime,{'\n'}editable later in Settings</Text>

            <Text style={s.sectionLabel}>🚗 Vehicle type</Text>
            <View style={s.options}>
              {CAR_TYPES.map(c => (
                <Pill key={c.value} selected={carType === c.value} label={c.label} onPress={() => setCarType(c.value === carType ? null : c.value)} />
              ))}
            </View>

            <Text style={[s.sectionLabel, { marginTop: 8 }]}>💰 Cost to fill up  (estimate)</Text>
            <View style={s.options}>
              {AMOUNTS.map(a => (
                <Pill key={a.value} selected={refAmount === a.value} label={a.label} onPress={() => setRefAmount(a.value === refAmount ? null : a.value)} />
              ))}
            </View>

            {/* Optional: full-tank range */}
            <Text style={[s.sectionLabel, { marginTop: 8 }]}>🛣️ Range on full tank  (optional)</Text>
            <Text style={s.hint}>How many km can you drive on a full tank? Enables km display.</Text>
            <View style={rangeS.inputRow}>
              <TextInput
                style={rangeS.input}
                value={totalRangeKm}
                onChangeText={setTotalRangeKm}
                placeholder="e.g. 600"
                placeholderTextColor="#4B5563"
                keyboardType="numeric"
                returnKeyType="done"
                accessibilityLabel="Full tank range km"
              />
              <Text style={rangeS.unit}>km</Text>
            </View>
          </View>
        )}

        {/* Step 4 — Current Tank Level (Q&A) */}
        {step === 4 && (
          <View style={s.stepWrap}>
            <Text style={s.emoji}>🛢️</Text>
            <Text style={s.title}>Wie viel hat dein Tank gerade?</Text>
            <Text style={s.subtitle}>
              So starten wir mit der richtigen Schätzung –{'\n'}
              du kannst das jederzeit anpassen.
            </Text>

            {/* Big % label */}
            <View style={levelS.box}>
              <Text style={levelS.pct}>{tankPct}%</Text>
              <Text style={levelS.label}>
                {tankPct >= 75 ? '🟢 Gut gefüllt'
                  : tankPct >= 40 ? '🟡 Halb voll'
                  : tankPct >= 15 ? '🟠 Wird knapp'
                  : '🔴 Fast leer'}
              </Text>
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

            <Text style={levelS.hint}>0% = leer • 50% = halb • 100% = voll</Text>
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
            {step < 4 ? 'Weiter →' : 'Start — FuelAmpel ✓'}
          </Text>
        </TouchableOpacity>

        {step === 1 && !homeArea && (
          <Text style={s.hint}>
            Enter your home area, then tap 🔍 to search.{' '}Can't connect? Tap <Text style={{ color: '#9CA3AF', fontWeight: '600' }}>Überspringen</Text> to set up later.
          </Text>
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
