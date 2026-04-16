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
  ActivityIndicator, StyleSheet, Keyboard, ViewStyle,
} from 'react-native';
import { searchAddressWithFallback, AddressSuggestion } from '../utils/geocoding';
import { CommonArea } from '../utils/types';

// ── Props ─────────────────────────────────────────────────────────────────────

interface LiveAddressInputProps {
  label?: string;
  icon?: string;
  placeholder?: string;
  selectedArea: CommonArea | null;
  onSelect: (area: CommonArea) => void;
  onClear: () => void;
  containerStyle?: ViewStyle;
  /** Minimum query length before searching. Default 3. */
  minLength?: number;
  /** Debounce delay in ms. Default 400 (real-time feel). */
  debounceMs?: number;
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
  minLength = 3,
  debounceMs = 400,
}: LiveAddressInputProps) {
  const [query,   setQuery]   = useState(selectedArea?.displayName ?? '');
  const [results, setResults] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef    = useRef<AbortController | null>(null);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function cancelPending() {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    if (abortRef.current)    { abortRef.current.abort();          abortRef.current    = null; }
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
      setResults(r);              // Always show dropdown — user confirms selection explicitly
    } catch {
      if (!ac?.signal.aborted) setLoading(false);
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
    onClear();
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
          // onBlur: only delays closing by 200ms so a suggestion tap registers.
          // We deliberately do NOT cancel the debounce here—the search should
          // still fire even if the user dismissed the keyboard before 400ms.
          onBlur={() => setTimeout(() => setResults([]), 200)}
          accessibilityLabel={label ?? placeholder}
        />
        <View style={livStyles.adornment}>
          {loading && <ActivityIndicator size="small" color="#6366F1" />}
          {!loading && resolved && <Text style={livStyles.check}>✓</Text>}
          {!loading && query.length > 0 && (
            <TouchableOpacity
              onPress={handleClear}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Clear input"
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
