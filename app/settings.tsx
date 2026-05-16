// ====================================================
// FuelAmpel — Settings Screen (v4 Minimalist)
//
// Design: Icon + keyword List Row. Pure dark card. No save buttons.
// All changes save instantly on change/blur.
// ====================================================

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Switch, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useUserStore } from '../src/store/userStore';
import { useFuelStore } from '../src/store/fuelStore';
import { formatFuelType } from '../src/utils/formatters';
import { FuelType, RefuelingStyle, CommonArea } from '../src/utils/types';
import { t } from '../src/utils/i18n';
import { LiveAddressInput } from '../src/components/LiveAddressInput';
import Constants from 'expo-constants';

// ── Constants ──────────────────────────────────────────────────────────────────

const FUEL_TYPES: FuelType[] = ['e5', 'e10', 'diesel'];

const REFUEL_STYLES: { value: RefuelingStyle; icon: string; labelKey: 'refuelStyleConvenient' | 'refuelStyleNearEmpty2' | 'refuelStyleCheapest2' }[] = [
  { value: 'convenient', icon: '🔔', labelKey: 'refuelStyleConvenient' },
  { value: 'nearEmpty',  icon: '🔇', labelKey: 'refuelStyleNearEmpty2' },
  { value: 'cheapest',   icon: '🏷️', labelKey: 'refuelStyleCheapest2' },
];

// ── Color tokens ───────────────────────────────────────────────────────────────

const C = {
  bg:        '#09090B',
  card:      '#18181B',
  card2:     '#1C1C1F',
  text:      '#F4F4F5',
  muted:     '#71717A',
  accent:    '#6366F1',
  accentFg:  '#A5B4FC',
  green:     '#22C55E',
  red:       '#EF4444',
  redFg:     '#FCA5A5',
  divider:   'rgba(255,255,255,0.06)',
};

// ── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return <Text style={sh.label}>{label}</Text>;
}
const sh = StyleSheet.create({
  label: { color: C.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1.4,
           textTransform: 'uppercase', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 6 },
});

// ── Row item ───────────────────────────────────────────────────────────────────

function Row({
  icon, label, right, onPress, danger, noDivider,
}: {
  icon: string; label: string; right?: React.ReactNode;
  onPress?: () => void; danger?: boolean; noDivider?: boolean;
}) {
  const Inner = (
    <View style={[row.wrap, !noDivider && row.divider]}>
      <Text style={row.icon}>{icon}</Text>
      <Text style={[row.label, danger && { color: C.redFg }]}>{label}</Text>
      <View style={row.right}>{right ?? null}</View>
    </View>
  );
  if (onPress) {
    return <TouchableOpacity onPress={onPress} activeOpacity={0.65}>{Inner}</TouchableOpacity>;
  }
  return Inner;
}
const row = StyleSheet.create({
  wrap:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, gap: 12 },
  divider: { borderBottomWidth: 1, borderBottomColor: C.divider },
  icon:    { fontSize: 17, width: 26, textAlign: 'center' },
  label:   { flex: 1, color: C.text, fontSize: 15 },
  right:   { alignItems: 'flex-end' },
});

// ── Value chip (right side of row) ────────────────────────────────────────────

function Chip({ label, color }: { label: string; color?: string }) {
  return <Text style={[chip.text, color ? { color } : {}]}>{label}</Text>;
}
const chip = StyleSheet.create({
  text: { color: C.muted, fontSize: 14, fontWeight: '500' },
});

// ── Inline number editor ───────────────────────────────────────────────────────

function InlineEditor({
  value, unit, onSave, onCancel, validate, placeholder,
}: {
  value: string; unit?: string; onSave: (val: string) => void;
  onCancel: () => void; validate?: (v: string) => boolean; placeholder?: string;
}) {
  const [local, setLocal] = useState(value);
  function commit() {
    if (validate && !validate(local)) { Alert.alert(t('alertInvalidValue'), ''); return; }
    onSave(local);
  }
  return (
    <View style={ed.wrap}>
      <TextInput
        style={ed.input}
        value={local}
        onChangeText={setLocal}
        keyboardType="decimal-pad"
        autoFocus
        placeholder={placeholder}
        placeholderTextColor={C.muted}
        returnKeyType="done"
        onSubmitEditing={commit}
      />
      {unit ? <Text style={ed.unit}>{unit}</Text> : null}
      <TouchableOpacity onPress={commit} style={ed.btn}>
        <Text style={ed.btnText}>✓</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onCancel} style={ed.cancelBtn}>
        <Text style={ed.cancelText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}
const ed = StyleSheet.create({
  wrap:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 8, backgroundColor: C.card2 },
  input:      { flex: 1, color: C.text, fontSize: 16, fontWeight: '600', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  unit:       { color: C.muted, fontSize: 13 },
  btn:        { backgroundColor: C.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  btnText:    { color: '#fff', fontWeight: '700', fontSize: 14 },
  cancelBtn:  { paddingHorizontal: 8, paddingVertical: 8 },
  cancelText: { color: C.muted, fontSize: 16 },
});

// ── Card wrapper ───────────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return <View style={cd.card}>{children}</View>;
}
const cd = StyleSheet.create({
  card: { backgroundColor: C.card, marginHorizontal: 16, borderRadius: 16, overflow: 'hidden' },
});

// ── Main ───────────────────────────────────────────────────────────────────────

type EditingField = 'capacity' | 'consumption' | 'odometer' | 'range' | 'threshold' | 'commuteDays' | null;

export default function SettingsScreen() {
  const router = useRouter();
  const {
    language, isSmartTankenEnabled, alertThresholdPct, commuteDaysInput,
    fuelType, commonAreas, refuelingStyle,
    setFuelType, setCommonAreas, setRefuelingStyle,
    setLanguage, setIsSmartTankenEnabled, setAlertThresholdPct, setCommuteDaysInput,
    setAvgConsumption, setTankCapacity, setTotalRangeKm, setOdometerKm,
    shadowTank, smartTank,
    fullReset,
  } = useUserStore();

  const recomputeDecision = useFuelStore(s => s.recomputeDecision);
  const switchFuelType    = useFuelStore(s => s.switchFuelType);

  const [editing, setEditing] = useState<EditingField>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Local area state
  const [homeArea, setHomeArea] = useState<CommonArea | null>(commonAreas[0] ?? null);
  const [workArea, setWorkArea] = useState<CommonArea | null>(commonAreas[1] ?? null);
  const [areaDirty, setAreaDirty] = useState(false);

  // Refresh local area copy on focus
  useFocusEffect(useCallback(() => {
    setHomeArea(commonAreas[0] ?? null);
    setWorkArea(commonAreas[1] ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commonAreas[0]?.plz, commonAreas[1]?.plz]));

  function saveAreas(h: CommonArea | null, w: CommonArea | null) {
    const areas: CommonArea[] = [];
    if (h) areas.push(h);
    if (w) areas.push(w);
    setCommonAreas(areas);
    setAreaDirty(false);
    recomputeDecision();
    console.log('[Settings] Areas saved:', areas.map(a => a.displayName).join(', '));
  }

  // Auto-save areas on blur
  useFocusEffect(useCallback(() => {
    return () => {
      if (areaDirty) {
        const areas: CommonArea[] = [];
        if (homeArea) areas.push(homeArea);
        if (workArea) areas.push(workArea);
        setCommonAreas(areas);
        setAreaDirty(false);
        console.log('[Settings] Auto-saved areas on blur');
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaDirty, homeArea, workArea]));

  // Current values
  const capacity    = (smartTank?.tankCapacityL ?? shadowTank.tankCapacityL).toString();
  const consumption = (smartTank?.consumptionPer100km ?? shadowTank.avgConsumptionPer100km).toString();
  const odometer    = smartTank?.odometerKm != null ? smartTank.odometerKm.toString() : '';
  const range       = smartTank?.totalRangeKm != null ? smartTank.totalRangeKm.toString() : '';

  const appVersion = (Constants.expoConfig?.version) ?? '—';

  function confirmFullReset() {
    Alert.alert(t('alertFullResetTitle'), t('alertFullResetBody'), [
      { text: t('alertCancel'), style: 'cancel' },
      { text: t('alertResetEverything'), style: 'destructive', onPress: () => {
        fullReset(); router.replace('/onboarding');
      }},
    ]);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Stack.Screen options={{ title: t('settingsTitle'), headerStyle: { backgroundColor: C.bg }, headerTintColor: C.text }} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={ss.content} keyboardShouldPersistTaps="handled">

        {/* ── BASICS ─────────────────────────────────────────────────── */}
        <SectionHeader label={t('settingsBasics')} />
        <Card>
          {/* Fuel Type */}
          <View style={[row.wrap, row.divider]}>
            <Text style={row.icon}>⛽</Text>
            <Text style={row.label}>{t('fuelTypeShort')}</Text>
            <View style={ss.tabRow}>
              {FUEL_TYPES.map(ft => (
                <TouchableOpacity
                  key={ft}
                  style={[ss.tab, fuelType === ft && ss.tabActive]}
                  onPress={() => { setFuelType(ft); switchFuelType(ft); }}>
                  <Text style={[ss.tabText, fuelType === ft && ss.tabTextA]}>
                    {formatFuelType(ft)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Language */}
          <View style={[row.wrap, row.divider]}>
            <Text style={row.icon}>🌐</Text>
            <Text style={row.label}>{t('language')}</Text>
            <View style={ss.tabRow}>
              {(['de', 'en'] as const).map(lang => (
                <TouchableOpacity key={lang} style={[ss.tab, language === lang && ss.tabActive]}
                  onPress={() => setLanguage(lang)}>
                  <Text style={[ss.tabText, language === lang && ss.tabTextA]}>
                    {lang === 'de' ? 'DE 🇩🇪' : 'EN 🇬🇧'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Home area */}
          <View style={{ zIndex: 20 }}>
            <View style={[row.wrap, row.divider]}>
              <Text style={row.icon}>🏠</Text>
              <View style={{ flex: 1 }}>
                <LiveAddressInput
                  label={t('homeShort')}
                  icon=""
                  placeholder={t('addrPlaceholder')}
                  selectedArea={homeArea}
                  onSelect={a => { setHomeArea(a); setAreaDirty(true); saveAreas(a, workArea); }}
                  onClear={() => { setHomeArea(null); setAreaDirty(true); saveAreas(null, workArea); }}
                  otherArea={workArea}
                />
              </View>
            </View>
          </View>

          {/* Work area */}
          <View style={{ zIndex: 10 }}>
            <View style={row.wrap}>
              <Text style={row.icon}>🏢</Text>
              <View style={{ flex: 1 }}>
                <LiveAddressInput
                  label={t('workShort')}
                  icon=""
                  placeholder={t('addrPlaceholder')}
                  selectedArea={workArea}
                  onSelect={a => { setWorkArea(a); setAreaDirty(true); saveAreas(homeArea, a); }}
                  onClear={() => { setWorkArea(null); setAreaDirty(true); saveAreas(homeArea, null); }}
                  otherArea={homeArea}
                />
              </View>
            </View>
          </View>
        </Card>

        {/* ── SMART TANKEN ───────────────────────────────────────────── */}
        <SectionHeader label={t('settingsSmartTanken')} />
        <Card>
          {/* Master toggle */}
          <Row icon="🧠" label={t('smartActive')} noDivider={!isSmartTankenEnabled}
            right={
              <Switch
                value={isSmartTankenEnabled}
                onValueChange={v => { setIsSmartTankenEnabled(v); recomputeDecision(); }}
                trackColor={{ false: '#3F3F46', true: C.accent }}
                thumbColor={isSmartTankenEnabled ? '#E0E7FF' : '#71717A'}
              />
            }
          />

          {isSmartTankenEnabled && (<>
            {/* Tank capacity */}
            {editing === 'capacity' ? (
              <InlineEditor
                value={capacity} unit="L"
                validate={v => { const n = parseFloat(v); return !isNaN(n) && n >= 20 && n <= 120; }}
                onSave={v => { setTankCapacity(parseFloat(v)); setEditing(null); recomputeDecision(); }}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <Row icon="🛢️" label={t('tankSizeShort')}
                right={<Chip label={`${capacity} L`} color={C.accentFg} />}
                onPress={() => setEditing('capacity')} />
            )}

            {/* Consumption */}
            {editing === 'consumption' ? (
              <InlineEditor
                value={consumption} unit="L/100"
                validate={v => { const n = parseFloat(v); return !isNaN(n) && n >= 3 && n <= 25; }}
                onSave={v => { setAvgConsumption(parseFloat(v)); setEditing(null); recomputeDecision(); }}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <Row icon="📊" label={t('consumptionShort')}
                right={<Chip label={`${consumption} L`} color={C.accentFg} />}
                onPress={() => setEditing('consumption')} />
            )}

            {/* Odometer */}
            {editing === 'odometer' ? (
              <InlineEditor
                value={odometer} unit="km"
                placeholder={t('odometerPlaceholder')}
                validate={v => { if (v.trim() === '') return true; const n = parseInt(v, 10); return !isNaN(n) && n >= 0 && n <= 999999; }}
                onSave={v => {
                  if (v.trim() !== '') setOdometerKm(parseInt(v, 10));
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <Row icon="🛣️" label={t('odometerLabel')}
                right={<Chip label={odometer ? `${parseInt(odometer).toLocaleString('de-DE')} km` : t('optionalLabel')} color={odometer ? C.accentFg : C.muted} />}
                onPress={() => setEditing('odometer')} />
            )}

            {/* Refueling style — 3-way toggle */}
            <View style={[row.wrap, row.divider]}>
              <Text style={row.icon}>🔔</Text>
              <Text style={row.label}>{t('refuelingStyle')}</Text>
              <View style={ss.styleRow}>
                {REFUEL_STYLES.map(s => (
                  <TouchableOpacity
                    key={s.value}
                    style={[ss.stylePill, refuelingStyle === s.value && ss.stylePillActive]}
                    onPress={() => { setRefuelingStyle(s.value); recomputeDecision(); }}>
                    <Text style={[ss.stylePillIcon, refuelingStyle === s.value && { opacity: 1 }]}>{s.icon}</Text>
                    <Text style={[ss.stylePillText, refuelingStyle === s.value && { color: C.accentFg }]}>
                      {t(s.labelKey)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Advanced toggle */}
            <TouchableOpacity style={ss.advRow} onPress={() => setShowAdvanced(!showAdvanced)}>
              <Text style={ss.advText}>{showAdvanced ? '▾' : '▸'}  {t('settingsAdvanced')}</Text>
            </TouchableOpacity>

            {showAdvanced && (<>
              {/* Alert threshold */}
              <View style={[row.wrap, row.divider]}>
                <Text style={row.icon}>🔋</Text>
                <Text style={row.label}>{t('alertThresholdShort')}</Text>
                <View style={ss.tabRow}>
                  {[20, 30, 40].map(pct => (
                    <TouchableOpacity key={pct}
                      style={[ss.tab, alertThresholdPct === pct && ss.tabActive]}
                      onPress={() => setAlertThresholdPct(pct)}>
                      <Text style={[ss.tabText, alertThresholdPct === pct && ss.tabTextA]}>{pct}%</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Commute days */}
              {editing === 'commuteDays' ? (
                <InlineEditor
                  value={commuteDaysInput.toString()} unit={t('commuteDaysShort')}
                  validate={v => { const n = parseInt(v, 10); return !isNaN(n) && n >= 1 && n <= 7; }}
                  onSave={v => { setCommuteDaysInput(parseInt(v, 10)); setEditing(null); }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <Row icon="🔁" label={t('commuteDaysShort')}
                  right={<Chip label={`${commuteDaysInput} d`} color={C.accentFg} />}
                  onPress={() => setEditing('commuteDays')} />
              )}

              {/* Range (optional) */}
              {editing === 'range' ? (
                <InlineEditor
                  value={range} unit="km"
                  placeholder={t('rangePlaceholder')}
                  validate={v => { if (v.trim() === '' || v === '0') return true; const n = parseFloat(v); return !isNaN(n) && n >= 50 && n <= 2000; }}
                  onSave={v => {
                    if (v.trim() === '' || v === '0') setTotalRangeKm(null);
                    else setTotalRangeKm(parseFloat(v));
                    setEditing(null);
                  }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <Row icon="📏" label={t('rangeShort')}
                  right={<Chip label={range ? `${range} km` : t('optionalLabel')} color={range ? C.accentFg : C.muted} />}
                  onPress={() => setEditing('range')} />
              )}
            </>)}
          </>)}
        </Card>

        {/* ── ABOUT ──────────────────────────────────────────────────── */}
        <SectionHeader label={t('settingsAbout')} />
        <Card>
          <Row icon="ℹ️" label="FuelAmpel" noDivider
            right={<Chip label={`v${appVersion}`} />} />
          <View style={[row.wrap]}>
            <Text style={row.icon}>🗄️</Text>
            <Text style={[row.label, { color: C.muted, fontSize: 13 }]}>
              {t('aboutCredit')}
            </Text>
          </View>
        </Card>

        {/* ── DANGER ZONE ────────────────────────────────────────────── */}
        <SectionHeader label={t('settingsDangerZone')} />
        <Card>
          <Row icon="🔄" label={t('fullReset')} danger noDivider
            onPress={confirmFullReset}
            right={<Text style={{ color: C.red, fontSize: 18 }}>›</Text>} />
        </Card>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  content:  { paddingTop: 8, paddingBottom: 60 },

  tabRow:   { flexDirection: 'row', gap: 6 },
  tab:      { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)' },
  tabActive:{ backgroundColor: 'rgba(99,102,241,0.22)' },
  tabText:  { color: C.muted, fontSize: 12, fontWeight: '600' },
  tabTextA: { color: C.accentFg },

  styleRow:     { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' },
  stylePill:    { alignItems: 'center', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', gap: 2 },
  stylePillActive: { backgroundColor: 'rgba(99,102,241,0.22)' },
  stylePillIcon:{ fontSize: 14, opacity: 0.45 },
  stylePillText:{ color: C.muted, fontSize: 10, fontWeight: '600' },

  advRow:   { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.divider },
  advText:  { color: C.muted, fontSize: 13, fontWeight: '600' },
});
