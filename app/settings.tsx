// ====================================================
// FuelAmpel — Settings Screen (v2)
// All UI in English.
// Editable: Fuel Type, Home/Work Area (autocomplete),
//           Refueling Style, Car Type, Last Refuel Amount, Shadow Tank
// Reset: Full Reset only (top of page)
// ====================================================

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useUserStore } from '../src/store/userStore';
import { formatFuelType } from '../src/utils/formatters';
import {
  FuelType, RefuelingStyle, CarType, LastRefuelAmount, CommonArea,
} from '../src/utils/types';
import { LiveAddressInput } from '../src/components/LiveAddressInput';


// ── Constants ─────────────────────────────────────────────────────────────────

const FUEL_TYPES: FuelType[] = ['e5', 'e10', 'diesel'];

const REFUELING_STYLE_OPTIONS: { value: RefuelingStyle; label: string }[] = [
  { value: 'nearEmpty',  label: 'When nearly empty' },
  { value: 'cheapest',   label: 'Best price always' },
];

const CAR_TYPE_OPTIONS: { value: CarType; label: string }[] = [
  { value: 'small',   label: 'Small  (< 45 L)' },
  { value: 'regular', label: 'Family  (45–65 L)' },
  { value: 'large',   label: 'Large / SUV  (65L+)' },
  { value: 'unknown', label: 'Not sure' },
];

const AMOUNT_OPTIONS: { value: LastRefuelAmount; label: string }[] = [
  { value: '<40',     label: '< 40 €' },
  { value: '40-60',   label: '40 – 60 €' },
  { value: '60-80',   label: '60 – 80 €' },
  { value: '80+',     label: '80 € +' },
  { value: 'unknown', label: "Don't remember" },
];

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
    setFuelType, setCommonAreas, setRefuelingStyle, setCarType, setLastRefuelAmount,
    recordRefuel, setAvgConsumption, setTankCapacity, setTotalRangeKm,
    fullReset,
  } = useUserStore();

  const [consumptionInput, setConsumptionInput] = useState(shadowTank.avgConsumptionPer100km.toString());
  const [capacityInput,    setCapacityInput]    = useState(shadowTank.tankCapacityL.toString());
  const [rangeInput,       setRangeInput]       = useState(
    smartTank?.totalRangeKm != null ? smartTank.totalRangeKm.toString() : ''
  );

  // Local resolved areas (mirrors store, updated on pick)
  const [homeArea, setHomeArea] = useState<CommonArea | null>(commonAreas[0] ?? null);
  const [workArea, setWorkArea] = useState<CommonArea | null>(commonAreas[1] ?? null);

  function updateHome(area: CommonArea) {
    setHomeArea(area);
    setCommonAreas(workArea ? [area, workArea] : [area]);
  }
  function clearHome() {
    setHomeArea(null);
    setCommonAreas(workArea ? [workArea] : []);
  }
  function updateWork(area: CommonArea) {
    setWorkArea(area);
    if (homeArea) setCommonAreas([homeArea, area]);
  }
  function clearWork() {
    setWorkArea(null);
    if (homeArea) setCommonAreas([homeArea]);
  }

  function handleSaveConsumption() {
    const val = parseFloat(consumptionInput);
    if (isNaN(val) || val < 3 || val > 25) { Alert.alert('Invalid', '3–25 L/100km'); return; }
    setAvgConsumption(val);
    Alert.alert('Saved', `Consumption: ${val} L/100km`);
  }
  function handleSaveCapacity() {
    const val = parseFloat(capacityInput);
    if (isNaN(val) || val < 20 || val > 120) { Alert.alert('Invalid', '20–120 L'); return; }
    setTankCapacity(val);
    Alert.alert('Saved', `Tank: ${val} L`);
  }
  function handleSaveRange() {
    if (rangeInput.trim() === '') {
      setTotalRangeKm(null);
      Alert.alert('Cleared', 'Tank bar will show % instead of km.');
      return;
    }
    const val = parseFloat(rangeInput);
    if (isNaN(val) || val < 50 || val > 2000) { Alert.alert('Invalid', '50–2000 km'); return; }
    setTotalRangeKm(val);
    Alert.alert('Saved', `Full tank range: ${val} km`);
  }
  function handleRefueled() {
    Alert.alert('Reset tank?', 'Mark tank as full?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Yes, refueled', onPress: () => { recordRefuel(); Alert.alert('Done', 'Shadow tank reset.'); }},
    ]);
  }

  function confirmFullReset() {
    Alert.alert('⚠️ Full Reset', 'Clear ALL data and return to setup screen?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset everything', style: 'destructive', onPress: () => {
        fullReset(); router.replace('/onboarding');
      }},
    ]);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>

      {/* ── RESET ── Emergency exit — always at top ── */}
      <Section title="Reset">
        <TouchableOpacity style={[styles.resetBtn, styles.resetBtnDanger]} onPress={confirmFullReset}>
          <Text style={[styles.resetBtnText, styles.resetBtnTextDanger]}>🔄  Full Reset / Start Over</Text>
          <Text style={styles.resetBtnDesc}>Clears everything — returns to setup screen</Text>
        </TouchableOpacity>
      </Section>

      {/* Fuel Type */}
      <Section title="Fuel Type">
        <View style={styles.tabRow}>
          {FUEL_TYPES.map(t => (
            <TouchableOpacity key={t} style={[styles.tab, fuelType === t && styles.tabActive]} onPress={() => setFuelType(t)}>
              <Text style={[styles.tabText, fuelType === t && styles.tabTextA]}>{formatFuelType(t)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Section>

      {/* Common Area */}
      <Section title="Areas (Home & Work)">
        <LiveAddressInput
          label="Home area"
          icon="🏠"
          placeholder="Address, city or postal code…"
          selectedArea={homeArea}
          onSelect={updateHome}
          onClear={clearHome}
        />
        <LiveAddressInput
          label="Work area  (optional)"
          icon="🏢"
          placeholder="Address, city or postal code…"
          selectedArea={workArea}
          onSelect={updateWork}
          onClear={clearWork}
        />
      </Section>

      {/* Refueling Style */}
      <Section title="Refueling Style">
        <OptionRow<RefuelingStyle> options={REFUELING_STYLE_OPTIONS} value={refuelingStyle} onSelect={setRefuelingStyle} />
      </Section>

      {/* Car Type */}
      <Section title="Vehicle Type">
        <OptionRow<CarType> options={CAR_TYPE_OPTIONS} value={carType} onSelect={setCarType} />
      </Section>

      {/* Full Tank Cost */}
      <Section title="Full Tank Cost">
        <OptionRow<LastRefuelAmount> options={AMOUNT_OPTIONS} value={lastRefuelAmount} onSelect={setLastRefuelAmount} />
      </Section>

      {/* Shadow Tank */}
      <Section title="Shadow Tank">
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Avg. Consumption (L/100km)</Text>
          <View style={styles.inputRow}>
            <TextInput style={styles.input} value={consumptionInput} onChangeText={setConsumptionInput} keyboardType="decimal-pad" placeholderTextColor="#4B5563" />
            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveConsumption}>
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Tank Capacity (litres)</Text>
          <View style={styles.inputRow}>
            <TextInput style={styles.input} value={capacityInput} onChangeText={setCapacityInput} keyboardType="decimal-pad" placeholderTextColor="#4B5563" />
            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveCapacity}>
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
        {/* Range on full tank — unlocks km display on Tank Bar */}
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Range on full tank (km)  <Text style={{ color: '#4B5563' }}>— optional</Text></Text>
          <Text style={{ color: '#6B7280', fontSize: 11, marginBottom: 4 }}>
            Sets the Tank Bar to show "≈ ZZZ km" instead of "%". Enter 0 or leave blank to revert to %.
          </Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={rangeInput}
              onChangeText={setRangeInput}
              keyboardType="numeric"
              placeholder="e.g. 600"
              placeholderTextColor="#4B5563"
            />
            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveRange}>
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Pressable style={({ pressed }) => [styles.refuelBtn, pressed && { opacity: 0.7 }]} onPress={handleRefueled}>
          <Text style={styles.refuelBtnText}>⛽  I refueled — Reset Tank</Text>
        </Pressable>
      </Section>

      {/* About */}
      <Section title="About">
        <Text style={styles.aboutText}>
          FuelAmpel uses the Tankerkönig API (CC BY 4.0).{'\n'}
          Fuel price data: © MTS-K / Bundeskartellamt.{'\n\n'}
          Shadow Tank estimates range via time-based consumption.
          No GPS tracking is stored.
        </Text>
        <Text style={styles.creditText}>Data: tankerkoenig.de</Text>
      </Section>

    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen:   { flex: 1, backgroundColor: '#0D0F14' },
  content:  { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 60, gap: 24 },

  section:      { gap: 10 },
  sectionTitle: { color: '#6B7280', fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  sectionBody:  { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', padding: 16, gap: 14 },

  tabRow:      { flexDirection: 'row', gap: 8 },
  tab:         { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  tabActive:   { backgroundColor: 'rgba(99,102,241,0.2)', borderColor: '#6366F1' },
  tabText:     { color: '#6B7280', fontSize: 13, fontWeight: '600' },
  tabTextA:    { color: '#A5B4FC' },

  optionGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optPill:            { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', backgroundColor: 'rgba(255,255,255,0.04)' },
  optPillActive:      { backgroundColor: 'rgba(99,102,241,0.18)', borderColor: '#6366F1' },
  optPillText:        { color: '#6B7280', fontSize: 12, fontWeight: '600' },
  optPillTextActive:  { color: '#A5B4FC' },

  settingRow:   { gap: 8 },
  settingLabel: { color: '#9CA3AF', fontSize: 13 },
  inputRow:     { flexDirection: 'row', gap: 8 },
  input:        { flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', color: '#F9FAFB', paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  saveBtn:      { backgroundColor: 'rgba(99,102,241,0.2)', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(99,102,241,0.3)' },
  saveBtnText:  { color: '#A5B4FC', fontWeight: '600', fontSize: 13 },
  refuelBtn:    { backgroundColor: 'rgba(34,197,94,0.1)', borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)', marginTop: 4 },
  refuelBtnText:{ color: '#22C55E', fontWeight: '700', fontSize: 14 },

  resetBtn:           { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', gap: 3 },
  resetBtnDanger:     { borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.06)' },
  resetBtnText:       { color: '#E5E7EB', fontSize: 14, fontWeight: '700' },
  resetBtnTextDanger: { color: '#FCA5A5' },
  resetBtnDesc:       { color: '#6B7280', fontSize: 12 },

  aboutText:  { color: '#6B7280', fontSize: 13, lineHeight: 20 },
  creditText: { color: '#4B5563', fontSize: 12, marginTop: 4 },
});
