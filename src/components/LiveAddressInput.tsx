// LiveAddressInput.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Ultra-simple real-time address search input.
//
// DESIGN PRINCIPLE: No blur/focus management whatsoever.
//   Dropdown visible   ↔  results.length > 0  (pure data state)
//   Dropdown invisible ↔  results cleared (pick / clear / type new text)
//
// User flow:
//   Type ≥ 3 chars → 400 ms debounce → search → results appear automatically
//   Tap suggestion  → auto-pick → done
//   Single result   → auto-picked without showing dropdown
//   Press ✕         → clear
//   Press keyboard Search key → immediate search (cancels pending debounce)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  ActivityIndicator, StyleSheet, Keyboard, ViewStyle, Alert,
} from 'react-native';
import * as Location from 'expo-location';
import { searchAddressWithFallback, AddressSuggestion, reverseGeocode } from '../utils/geocoding';
import { CommonArea } from '../utils/types';
import { t } from '../utils/i18n';

// ── Props ─────────────────────────────────────────────────────────────────────

interface LiveAddressInputProps {
  label?: string;
  icon?: string;
  placeholder?: string;
  selectedArea: CommonArea | null;
  onSelect: (area: CommonArea) => void;
  onClear: () => void;
  containerStyle?: ViewStyle;
  /** The other address field's resolved area — used for same-location detection (<500m). */
  otherArea?: CommonArea | null;
  /** Minimum query length before searching. Default 3. */
  minLength?: number;
  /** Debounce delay in ms. Default 400 (real-time feel). */
  debounceMs?: number;
}

// ── Haversine distance (metres) ───────────────────────────────────────────────
function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LiveAddressInput({
  label,
  icon,
  placeholder = 'Address, city or postal code…',
  selectedArea,
  onSelect,
  onClear,
  containerStyle,
  otherArea,
  minLength = 3,
  debounceMs = 400,
}: LiveAddressInputProps) {
  const [query,   setQuery]   = useState(selectedArea?.displayName ?? '');
  const [results, setResults] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef    = useRef<AbortController | null>(null);

  // Track whether the input has blurred while a search is still in-flight.
  // When the search completes, auto-pick the first result instead of
  // showing a dropdown that the user can no longer interact with.
  const blurredWhileLoadingRef = useRef(false);

  // Ref mirror of results for use in blur timeout (avoids stale closure)
  const resultsRef = useRef<AddressSuggestion[]>([]);
  resultsRef.current = results;

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function cancelPending() {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    if (abortRef.current)    { abortRef.current.abort();          abortRef.current    = null; }
  }

  /** Silently commit an AddressSuggestion without dismissing keyboard (already gone). */
  function autoPickResult(s: AddressSuggestion) {
    setQuery(s.shortName);
    setResults([]);
    setLoading(false);
    onSelect({ plz: '', displayName: s.shortName, loc: s.loc });
    console.log(`[LiveAddressInput] Auto-picked first result: ${s.shortName}`);
  }

  async function runSearch(q: string) {
    cancelPending();
    setLoading(true);
    setResults([]);

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const { results: r } = await searchAddressWithFallback(q, ac.signal);
      if (ac.signal.aborted) return;
      abortRef.current = null;
      setLoading(false);

      // If the user already blurred while this search was running,
      // auto-pick the first result immediately instead of showing a
      // dropdown the user can no longer see or interact with.
      if (blurredWhileLoadingRef.current && r.length > 0) {
        blurredWhileLoadingRef.current = false;
        autoPickResult(r[0]);
        return;
      }
      blurredWhileLoadingRef.current = false;

      setResults(r);              // Show dropdown — user confirms selection explicitly
    } catch {
      if (!ac?.signal.aborted) setLoading(false);
      blurredWhileLoadingRef.current = false;
    }
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function onChange(text: string) {
    setQuery(text);
    setResults([]);                 // Clear stale results immediately
    cancelPending();

    if (text.trim().length < minLength) {
      setLoading(false);
      return;
    }

    // Schedule search — fires whether or not user still has focus.
    const q = text.trim();
    setLoading(true);
    debounceRef.current = setTimeout(() => runSearch(q), debounceMs);
  }

  function onSubmitEditing() {
    // Keyboard "Search" key — fire immediately without waiting for debounce.
    const q = query.trim();
    if (q.length < minLength) return;
    runSearch(q);
  }

  function pickResult(s: AddressSuggestion) {
    cancelPending();
    setQuery(s.shortName);
    setResults([]);
    setLoading(false);
    Keyboard.dismiss();
    onSelect({ plz: '', displayName: s.shortName, loc: s.loc });
  }

  function handleClear() {
    cancelPending();
    setQuery('');
    setResults([]);
    setLoading(false);
    blurredWhileLoadingRef.current = false;
    onClear();
  }

  // ── GPS current location ────────────────────────────────────────────────────

  async function handleGpsPress() {
    if (gpsLoading || loading) return;
    setGpsLoading(true);
    cancelPending();
    setResults([]);

    try {
      // 1. Permission check
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Standort', 'Bitte erlaube den Standort\u00ADzugriff in den Geräte\u00ADeinstellungen.');
        setGpsLoading(false);
        return;
      }
      console.log('[GPS] Permission granted — acquiring position…');

      // 2. Try cached location first (instant), fall back to fresh fix with timeout
      let coords: { latitude: number; longitude: number } | null = null;

      const cached = await Location.getLastKnownPositionAsync();
      if (cached) {
        // Accept cache if it's < 5 minutes old
        const ageMs = Date.now() - (cached.timestamp ?? 0);
        if (ageMs < 5 * 60_000) {
          coords = cached.coords;
          console.log(`[GPS] Using cached position (age ${Math.round(ageMs / 1000)}s)`);
        }
      }

      if (!coords) {
        // Fresh GPS fix — race against 6s timeout to prevent infinite hang
        const GPS_TIMEOUT_MS = 6_000;
        console.log('[GPS] No usable cache — requesting fresh fix (6s timeout)…');

        const positionPromise = Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low,
        });
        const timeoutPromise = new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), GPS_TIMEOUT_MS),
        );

        const result = await Promise.race([positionPromise, timeoutPromise]);
        if (!result) {
          console.warn('[GPS] Position request timed out after 6s');
          setGpsLoading(false);
          Alert.alert('Standort', 'GPS-Position konnte nicht rechtzeitig ermittelt werden. Bitte versuche es draußen erneut.');
          return;
        }
        coords = result.coords;
        console.log(`[GPS] Fresh fix acquired: ${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`);
      }

      // 3. Reverse geocode
      console.log('[GPS] Reverse geocoding…');
      const addressResult = await reverseGeocode(coords.latitude, coords.longitude);
      setGpsLoading(false);

      if (!addressResult) {
        console.warn('[GPS] Reverse geocode returned null');
        Alert.alert('Standort', 'Koordinaten erhalten, aber Adresse konnte nicht aufgelöst werden.');
        return;
      }

      console.log(`[GPS] Address resolved: ${addressResult.shortName}`);

      // 4. Same-location soft warning (<500m)
      if (otherArea?.loc) {
        const dist = haversineM(
          addressResult.loc.lat, addressResult.loc.lng,
          otherArea.loc.lat, otherArea.loc.lng,
        );
        if (dist < 500) {
          Alert.alert(
            'Gleicher Standort',
            'Diese Adresse ist sehr nah an deiner anderen Adresse. Trotzdem verwenden?',
            [
              { text: 'Abbrechen', style: 'cancel' },
              { text: 'Verwenden', onPress: () => commitGpsResult(addressResult) },
            ],
          );
          return;
        }
      }

      commitGpsResult(addressResult);
    } catch (err) {
      setGpsLoading(false);
      console.error('[GPS] Unhandled error in GPS flow:', err);
      Alert.alert('Standort', 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.');
    }
  }

  function commitGpsResult(s: AddressSuggestion) {
    setQuery(s.shortName);
    setResults([]);
    Keyboard.dismiss();
    onSelect({ plz: '', displayName: s.shortName, loc: s.loc });
    console.log(`[LiveAddressInput] GPS location set: ${s.shortName}`);
  }

  /**
   * On blur: if results are already available, auto-pick the first one
   * so the user's typed address is not silently lost.
   * If a search is still in-flight (loading), mark the ref so the
   * search callback will auto-pick when it resolves.
   */
  function handleBlur() {
    setTimeout(() => {
      const currentResults = resultsRef.current;
      if (currentResults.length > 0) {
        // Results already available — auto-pick first
        autoPickResult(currentResults[0]);
      } else if (loading) {
        // Search still running — defer auto-pick to runSearch callback
        blurredWhileLoadingRef.current = true;
      } else {
        // No results and no pending search — just clear dropdown
        setResults([]);
      }
    }, 200); // 200ms delay so a suggestion tap can still register first
  }

  // ── Derived state ───────────────────────────────────────────────────────────

  const resolved     = selectedArea !== null;
  const showDropdown = results.length > 0;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={[livStyles.container, containerStyle]}>

      {/* Label */}
      {(label || icon) && (
        <Text style={livStyles.label}>
          {icon ? `${icon}  ` : ''}{label}
        </Text>
      )}

      {/* Input row */}
      <View style={[livStyles.inputWrap, resolved && livStyles.inputWrapOk]}>
        <TextInput
          style={livStyles.input}
          value={query}
          onChangeText={onChange}
          onSubmitEditing={onSubmitEditing}
          placeholder={placeholder}
          placeholderTextColor="#4B5563"
          returnKeyType="search"
          onBlur={handleBlur}
          accessibilityLabel={label ?? placeholder}
        />
        <View style={livStyles.adornment}>
          {(loading || gpsLoading) && <ActivityIndicator size="small" color="#6366F1" />}
          {!loading && !gpsLoading && resolved && <Text style={livStyles.check}>✓</Text>}
          {!loading && !gpsLoading && (
            <TouchableOpacity
              onPress={handleGpsPress}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Aktuellen Standort verwenden"
            >
              <Text style={livStyles.gpsIcon}>📍</Text>
            </TouchableOpacity>
          )}
          {!loading && !gpsLoading && query.length > 0 && (
            <TouchableOpacity
              onPress={handleClear}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={t('clearInputA11y')}
            >
              <Text style={livStyles.clear}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Suggestion dropdown — shows based on data, not focus state */}
      {showDropdown && (
        <View style={livStyles.dropdown}>
          <FlatList
            data={results}
            keyExtractor={(_, i) => i.toString()}
            keyboardShouldPersistTaps="always"   // CRITICAL: tap registers even when keyboard is open
            scrollEnabled={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={livStyles.row}
                onPress={() => pickResult(item)}
                activeOpacity={0.7}
              >
                <Text style={livStyles.rowShort} numberOfLines={1}>{item.shortName}</Text>
                <Text style={livStyles.rowFull}  numberOfLines={1}>{item.displayName}</Text>
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={livStyles.sep} />}
          />
        </View>
      )}

    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

export const livStyles = StyleSheet.create({
  container:   { zIndex: 10, gap: 6 },
  label:       { color: '#9CA3AF', fontSize: 13, fontWeight: '600' },
  inputWrap:   {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12, paddingVertical: 2,
  },
  inputWrapOk: { borderColor: '#22C55E' },
  input:       { flex: 1, color: '#F9FAFB', fontSize: 14, paddingVertical: 10 },
  adornment:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  check:       { color: '#22C55E', fontSize: 16, fontWeight: '700' },
  clear:       { color: '#4B5563', fontSize: 13, fontWeight: '700' },
  gpsIcon:     { fontSize: 16, opacity: 0.7 },
  dropdown:    {
    marginTop: 4,
    backgroundColor: '#1E2130',
    borderRadius: 10, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  row:         { paddingHorizontal: 14, paddingVertical: 10, gap: 2 },
  rowShort:    { color: '#F9FAFB', fontSize: 13, fontWeight: '700' },
  rowFull:     { color: '#6B7280', fontSize: 11 },
  sep:         { height: 1, backgroundColor: 'rgba(255,255,255,0.05)' },
});
