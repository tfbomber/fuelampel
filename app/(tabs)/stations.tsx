// ====================================================
// FuelAmpel — Stations Tab (Redesigned)
// Clean browse screen: PLZ input, compact filter bar,
// 3 sort modes (Price / Distance / Value★), closed=strikethrough
// ====================================================

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, TextInput, Pressable,
  Keyboard, Modal,
} from 'react-native';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useFuelStore } from '../../src/store/fuelStore';
import { useUserStore } from '../../src/store/userStore';
import { StationListItem } from '../../src/components/StationListItem';
import { StationMapView } from '../../src/components/StationMapView';
import { TankConfirmModal } from '../../src/components/TankConfirmModal';
import { Station, FuelType, GeoLocation } from '../../src/utils/types';
import { formatFuelType } from '../../src/utils/formatters';
import { geocodePLZ, searchAddressWithFallback, AddressSuggestion } from '../../src/utils/geocoding';
import { sortByValue, findNearestOpen } from '../../src/utils/ranking';
import { estimateLevelPercent } from '../../src/core/smartTank';
import { TANK_CONFIRM_LOCK_DAYS } from '../../src/utils/constants';
import * as Haptics from 'expo-haptics';

type SortMode = 'price' | 'distance' | 'value';
type ViewMode = 'list' | 'map';
type SearchState = 'idle' | 'loading' | 'no_results' | 'error';
const FUEL_TYPES: FuelType[] = ['e5', 'e10', 'diesel'];

// ─── Median helper ────────────────────────────────────────────────────────────
function median(prices: number[]): number {
  if (prices.length === 0) return 0;
  const s = [...prices].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function StationsScreen() {
  const { stations, isLoading, error, refresh, switchFuelType, distanceSource } = useFuelStore();
  const { 
    fuelType: storedFuelType, 
    homeLocation, 
    shadowTank,
    smartTank,
    lastPromptedMs,
    setLastPrompted,
    confirmCurrentLevel,
  } = useUserStore();
  // Tank capacity from user settings (fallback to DEFAULT_TANK_CAPACITY = 50L)
  const fillUpLitres = shadowTank.tankCapacityL;
  const router = useRouter();

  const [sortMode, setSortMode] = useState<SortMode>('value');
  const [viewMode, setViewMode]  = useState<ViewMode>('list');
  const [localFuelType, setLocalFuelType] = useState<FuelType>(storedFuelType);
  const [showValueInfo, setShowValueInfo] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  // ── Location / address search state ──────────────────────────────────────
  const [locQuery,       setLocQuery]       = useState('');
  const [locSuggestions, setLocSuggestions] = useState<AddressSuggestion[]>([]);
  const [locSearchState, setLocSearchState] = useState<SearchState>('idle');
  const [locOpen,        setLocOpen]        = useState(false);
  const locAbortRef    = useRef<AbortController | null>(null);
  const locDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [locationLabel, setLocationLabel] = useState('GPS');
  const currentLocation = useRef<GeoLocation | null>(null);

  // ── Auto-load on mount (once only) ──────────────────────────────────────
  useEffect(() => {
    if (stations.length === 0 && !isLoading) {
      fetchViaGPS();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 5-sec Confirm Modal Timer (re-arms when smartTank or lastPromptedMs changes) ──
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!smartTank) return;
      const now = Date.now();
      const MS_IN_DAY = 86_400_000;
      const daysSinceConfirmed = (now - smartTank.lastConfirmedMs) / MS_IN_DAY;
      const daysSincePrompted  = (now - lastPromptedMs) / MS_IN_DAY;
      const estPct = estimateLevelPercent(smartTank);

      if (
        daysSincePrompted  > TANK_CONFIRM_LOCK_DAYS &&
        daysSinceConfirmed > TANK_CONFIRM_LOCK_DAYS &&
        estPct < 40
      ) {
        setShowConfirmModal(true);
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [smartTank, lastPromptedMs]);

  // ── GPS fetch ─────────────────────────────────────────────────────────────
  async function fetchViaGPS(fuelType?: FuelType) {
    const ft = fuelType ?? localFuelType;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        currentLocation.current = loc;
        setLocationLabel('GPS');
        await refresh(loc, true, ft);
        return;
      }
    } catch { /* fall through */ }

    if (homeLocation) {
      currentLocation.current = homeLocation;
      setLocationLabel('Home');
      await refresh(homeLocation, true, ft);
    }
  }

  // ── Location search (PLZ or address) ─────────────────────────────────────
  // Accepts both PLZ (5 digits → geocodePLZ) and free text (address → cascade).
  // textOverride: pass raw input text directly to avoid stale closures in debounce callbacks.
  async function triggerLocationSearch(textOverride?: string) {
    const q = (textOverride ?? locQuery).trim();
    if (!q) { fetchViaGPS(); return; }

    if (locAbortRef.current) { locAbortRef.current.abort(); locAbortRef.current = null; }
    Keyboard.dismiss();
    setLocSearchState('loading');
    setLocOpen(false);
    setLocSuggestions([]);

    // Fast path: 5-digit PLZ
    if (/^\d{4,5}$/.test(q)) {
      try {
        const loc = await geocodePLZ(q);
        if (!loc) {
          setLocSearchState('no_results');
          return;
        }
        currentLocation.current = loc;
        setLocationLabel(`PLZ ${q}`);
        setLocSearchState('idle');
        await refresh(loc, true, localFuelType);
      } catch {
        setLocSearchState('error');
      }
      return;
    }

    // Slow path: free-text address → cascade Nominatim → Photon
    const ac = new AbortController();
    locAbortRef.current = ac;
    const { results, failed } = await searchAddressWithFallback(q, ac.signal);
    if (ac.signal.aborted) return;
    locAbortRef.current = null;

    if (results.length === 1) {
      // Single result — pick it immediately, no dropdown needed
      pickLocSuggestion(results[0]);
    } else if (results.length > 1) {
      setLocSuggestions(results);
      setLocOpen(true);
      setLocSearchState('idle');
    } else {
      setLocSearchState(failed ? 'error' : 'no_results');
    }
  }

  function pickLocSuggestion(s: AddressSuggestion) {
    if (!s.loc) return;
    currentLocation.current = s.loc;
    setLocationLabel(s.shortName);
    setLocQuery(s.shortName);
    setLocSuggestions([]);
    setLocOpen(false);
    setLocSearchState('idle');
    Keyboard.dismiss();
    refresh(s.loc, true, localFuelType);
  }

  function clearLocSearch() {
    if (locAbortRef.current) { locAbortRef.current.abort(); locAbortRef.current = null; }
    setLocQuery('');
    setLocSuggestions([]);
    setLocOpen(false);
    setLocSearchState('idle');
  }


  const onRefresh = useCallback(() => {
    const loc = currentLocation.current;
    if (loc) refresh(loc, true, localFuelType);
    else fetchViaGPS(localFuelType);
  }, [refresh, homeLocation, localFuelType]);

  // ── Fuel type switch — zero network (re-picks from cached raw prices) ────
  function handleFuelTypeChange(newType: FuelType) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLocalFuelType(newType);
    if (stations.length > 0) {
      switchFuelType(newType);
    } else {
      const loc = currentLocation.current;
      if (loc) refresh(loc, true, newType);
      else fetchViaGPS(newType);
    }
  }

  // ── Regional median ───────────────────────────────────────────────────────
  const regionMedian = useMemo(() => {
    const prices = stations.filter(s => s.isOpen && s.price !== null).map(s => s.price as number);
    return median(prices);
  }, [stations]);

  // ── Sorted + filtered list (closed participates in price/dist sort) ─────────
  const displayList = useMemo(() => {
    const list = [...stations];
    if (sortMode === 'price') {
      list.sort((a, b) => {
        if (a.price === null) return 1;
        if (b.price === null) return -1;
        return a.price - b.price;
      });
    } else if (sortMode === 'distance') {
      list.sort((a, b) => a.dist - b.dist);
    } else {
      return sortByValue(list);
    }
    return list;
  }, [stations, sortMode]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const cheapestPrice = useMemo(() => {
    const open = stations.filter(s => s.isOpen && s.price !== null);
    if (!open.length) return null;
    return Math.min(...open.map(s => s.price as number));
  }, [stations]);

  // ── Nearest open station (Value baseline) ────────────────────────────────
  const nearestOpen = useMemo(() => findNearestOpen(stations), [stations]);

  // ── Delta baseline: price of the middle-ranked station in the displayed list ──
  // Used for ±Δ in price/distance modes.
  // Middle station = the one at rank ceil(n/2) in the current sorted list.
  const deltaBaseline = useMemo(() => {
    const open = displayList.filter(s => s.isOpen && s.price !== null);
    if (open.length === 0) return regionMedian;
    const midIdx = Math.floor((open.length - 1) / 2);
    return open[midIdx].price as number;
  }, [displayList, regionMedian]);

  // ── Render row ────────────────────────────────────────────────────────────
  const renderItem = useCallback(({ item, index }: { item: Station; index: number }) => (
    <StationListItem
      station={item}
      regionMedian={regionMedian}
      nearest={nearestOpen}
      fillUpLitres={fillUpLitres}
      rank={index + 1}
      displayMode={sortMode}
      distanceSource={distanceSource}
    />
  ), [regionMedian, nearestOpen, fillUpLitres, sortMode, distanceSource]);

  // ── Summary bar (replaces stats row + column labels) ─────────────────────
  function ListHeader() {
    if (stations.length === 0) return null;
    const fromPrice = cheapestPrice ? `from ${cheapestPrice.toFixed(3)} €` : '';
    return (
      <View style={styles.summaryBar}>
        <Text style={styles.summaryText} numberOfLines={1}>
          {displayList.length} stations
          {fromPrice ? `  ·  ${fromPrice}` : ''}
          {'  ·  '}
          <Text style={styles.summarySrc}>{locationLabel}</Text>
        </Text>
        {sortMode === 'value' && (
          <TouchableOpacity
            onPress={() => setShowValueInfo(true)}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            accessibilityLabel="Value ranking explanation"
          >
            <Text style={styles.summaryInfoIcon}>ⓘ</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  function EmptyState() {
    if (isLoading) return null;
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyEmoji}>⛽</Text>
        <Text style={styles.emptyTitle}>No stations yet</Text>
        <Text style={styles.emptyText}>
          Enter a PLZ above or allow location access, then pull to refresh.
        </Text>
      </View>
    );
  }

  // ─── Layout ───────────────────────────────────────────────────────────────
  return (
    <View style={styles.screen}>

      {/* ── Location search bar ─────────────────────────────────────────── */}
      <View style={styles.locBar}>
        <View style={styles.locInputWrap}>
          <TextInput
            style={styles.plzInput}
            placeholder="📮 PLZ or address…"
            placeholderTextColor="#4B5563"
            value={locQuery}
            onChangeText={(t) => {
              setLocQuery(t);
              setLocSearchState('idle');
              if (locAbortRef.current) { locAbortRef.current.abort(); locAbortRef.current = null; }
              setLocSuggestions([]);
              setLocOpen(false);
              // Auto-search debounce: fire 800ms after user stops typing.
              if (locDebounceRef.current) clearTimeout(locDebounceRef.current);
              if (t.trim().length >= 3) {
                locDebounceRef.current = setTimeout(() => triggerLocationSearch(t.trim()), 800);
              }
            }}
            returnKeyType="search"
            onSubmitEditing={() => triggerLocationSearch()}
            onBlur={() => {
              // Cancel debounce + in-flight request on blur
              if (locDebounceRef.current) { clearTimeout(locDebounceRef.current); locDebounceRef.current = null; }
              if (locAbortRef.current) { locAbortRef.current.abort(); locAbortRef.current = null; }
              setLocSearchState('idle');
              setTimeout(() => setLocOpen(false), 200);
            }}
            accessibilityLabel="Location or postal code search"
          />
          {/* Clear button */}
          {locQuery.length > 0 && locSearchState !== 'loading' && (
            <TouchableOpacity
              onPress={clearLocSearch}
              style={styles.locClearBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.locClearBtnText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={styles.searchBtn}
          onPress={locQuery.trim() ? () => triggerLocationSearch() : () => fetchViaGPS()}
          disabled={locSearchState === 'loading' || isLoading}
          accessibilityLabel={locQuery.trim() ? 'Search location' : 'Use GPS location'}
        >
          {locSearchState === 'loading' ? (
            <ActivityIndicator size="small" color="#A5B4FC" />
          ) : (
            <Text style={styles.searchBtnText}>{locQuery.trim() ? '🔍' : '📍 GPS'}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Address suggestion dropdown ──────────────────────────────────── */}
      {locOpen && locSuggestions.length > 0 && (
        <View style={styles.locDropdown}>
          {locSuggestions.map((s, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.locSuggestion, i > 0 && styles.locSuggestionBorder]}
              onPress={() => pickLocSuggestion(s)}
              activeOpacity={0.7}
            >
              <Text style={styles.locSuggestionShort} numberOfLines={1}>{s.shortName}</Text>
              <Text style={styles.locSuggestionFull} numberOfLines={1}>{s.displayName}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── Search error/no-result feedback ──────────────────────────────── */}
      {(locSearchState === 'error' || locSearchState === 'no_results') && (
        <View style={styles.locStatusBanner}>
          <Text style={styles.locStatusText}>
            {locSearchState === 'error'
              ? '⚠️ Netzwerkfehler — GPS verwenden'
              : `Kein Ergebnis für "${locQuery}"`}
          </Text>
          <TouchableOpacity onPress={() => fetchViaGPS()} style={styles.locGpsBtn}>
            <Text style={styles.locGpsBtnText}>📍 GPS</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Filter bar ─────────────────────────────────────────────────── */}
      <View style={styles.filterBar}>
        {/* Fuel type pills — clickable, defaults to global setting */}
        <View style={styles.fuelRow}>
          {FUEL_TYPES.map(type => (
            <TouchableOpacity
              key={type}
              style={[styles.fuelPill, localFuelType === type && styles.fuelPillActive]}
              onPress={() => handleFuelTypeChange(type)}
              accessibilityLabel={`Show ${formatFuelType(type)} prices`}
            >
              <Text style={[styles.fuelPillText, localFuelType === type && styles.fuelPillTextActive]}>
                {formatFuelType(type)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Sort tabs ─ hidden in map mode */}
        {viewMode === 'list' && (
          <View style={styles.sortGroup}>
            {(['price', 'distance', 'value'] as SortMode[]).map(mode => (
              <TouchableOpacity
                key={mode}
                style={[styles.sortBtn, sortMode === mode && styles.sortBtnActive]}
                onPress={() => setSortMode(mode)}
                accessibilityLabel={`Sort by ${mode}`}
              >
                <Text style={[styles.sortBtnText, sortMode === mode && styles.sortBtnTextActive]}>
                  {mode === 'price' ? '💰 Price' : mode === 'distance' ? '📍 Dist' : '⭐ Value'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* List / Map toggle */}
        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={[styles.viewToggleBtn, viewMode === 'list' && styles.viewToggleBtnActive]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setViewMode('list'); }}
            accessibilityLabel="List view"
          >
            <Text style={[styles.viewToggleBtnText, viewMode === 'list' && styles.viewToggleBtnTextActive]}>
              📋 List
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewToggleBtn, viewMode === 'map' && styles.viewToggleBtnActive]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setViewMode('map'); }}
            accessibilityLabel="Map view"
          >
            <Text style={[styles.viewToggleBtnText, viewMode === 'map' && styles.viewToggleBtnTextActive]}>
              🗺️ Map
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Loading ─────────────────────────────────────────────────────── */}
      {isLoading && stations.length === 0 && (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#6366F1" />
          <Text style={styles.loadingText}>Fetching stations…</Text>
        </View>
      )}

      {/* ── Error banner ────────────────────────────────────────────────── */}
      {error && !isLoading && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
        </View>
      )}

      {/* ── Map view ───────────────────────────────────────────────── */}
      {viewMode === 'map' && stations.length > 0 && (
        <StationMapView
          stations={stations}
          currentLocation={currentLocation.current}
          fuelType={localFuelType}
          regionMedian={regionMedian}
          nearestStation={nearestOpen}
          cheapestStation={stations.find(s => s.isOpen && s.price === cheapestPrice) ?? null}
        />
      )}
      {viewMode === 'map' && stations.length === 0 && !isLoading && (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyEmoji}>🗺️</Text>
          <Text style={styles.emptyTitle}>Karte bereit</Text>
          <Text style={styles.emptyText}>Zuerst GPS oder PLZ oben eingeben.</Text>
        </View>
      )}

      {/* ── Station FlatList (list mode only) ────────────────────────────── */}
      {viewMode === 'list' && (
        <FlatList
          data={displayList}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={EmptyState}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={onRefresh}
              tintColor="#6366F1"
              colors={['#6366F1']}
            />
          }
          contentContainerStyle={displayList.length === 0 ? styles.emptyContainer : undefined}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />
      )}

      {/* ── Value Info Modal ─────────────────────────────────────────── */}
      <Modal
        visible={showValueInfo}
        transparent
        animationType="fade"
        onRequestClose={() => setShowValueInfo(false)}
      >
        {/* Full-screen tap-to-dismiss overlay */}
        <Pressable style={styles.infoOverlay} onPress={() => setShowValueInfo(false)}>
          {/* Stop tap from propagating through the card */}
          <Pressable style={styles.infoCard} onPress={e => e.stopPropagation()}>
            <Text style={styles.infoTitle}>⭐ Value Ranking — How it works</Text>

            <View style={styles.infoRow}>
              <Text style={styles.infoEmoji}>📍</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoRowTitle}>Base — Nearest open station</Text>
                <Text style={styles.infoRowDesc}>The default choice: no extra detour needed</Text>
              </View>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoEmoji}>#1</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoRowTitle}>Rank #1 — Best value</Text>
                <Text style={styles.infoRowDesc}>Saves more than Base after accounting for the extra distance cost</Text>
              </View>
            </View>

            <View style={styles.infoDivider} />

            <Text style={styles.infoFormula}>Formula: (price diff × tank size) − (extra km × fuel cost)</Text>
            <Text style={styles.infoFormula}>Positive = worth the detour  ·  Negative = just go to Base</Text>

            <TouchableOpacity
              style={styles.infoDismiss}
              onPress={() => setShowValueInfo(false)}
            >
              <Text style={styles.infoDismissText}>Got it</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Lightweight Tank Confirm Modal ─────────────────────────────── */}
      {smartTank && (
        <TankConfirmModal
          visible={showConfirmModal}
          estimatedPercent={estimateLevelPercent(smartTank)}
          onConfirm={() => {
            confirmCurrentLevel(); // Marks confidence = 1.0, and sets lastPromptedMs
            setShowConfirmModal(false);
          }}
          onAdjust={() => {
            setLastPrompted();
            setShowConfirmModal(false);
            router.navigate('/?action=highlightTank');
          }}
          onClose={() => {
            // Dismissed without action counts as a prompt (cooldown starts)
            setLastPrompted();
            setShowConfirmModal(false);
          }}
        />
      )}

    </View>
  );
}

// ─── Helper sub-components ───────────────────────────────────────────────────
function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={statStyles.item}>
      <Text style={[statStyles.value, color ? { color } : null]}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}
function StatDiv() { return <View style={statStyles.div} />; }
const statStyles = StyleSheet.create({
  item: { flex: 1, alignItems: 'center', gap: 1 },
  value: { color: '#F9FAFB', fontSize: 13, fontWeight: '800' },
  label: { color: '#9CA3AF', fontSize: 10 },  // boosted from #4B5563
  div: { width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.07)' },
});

// ─── Main styles ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0D0F14' },

  // Location bar
  locBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 8,
    backgroundColor: '#111318',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  plzInput: {
    flex: 1,
    backgroundColor: 'transparent',
    color: '#F9FAFB',
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
  },
  // Wraps plzInput + clear button inside locBar
  locInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingRight: 6,
  },
  locClearBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  locClearBtnText: { color: '#4B5563', fontSize: 13, fontWeight: '700' },

  // Address suggestion dropdown
  locDropdown: {
    backgroundColor: '#1A1D26',
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  locSuggestion:       { paddingHorizontal: 16, paddingVertical: 10, gap: 2 },
  locSuggestionBorder: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  locSuggestionShort:  { color: '#F9FAFB', fontSize: 14, fontWeight: '700' },
  locSuggestionFull:   { color: '#6B7280', fontSize: 11 },

  // Status banner (no-result / error)
  locStatusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(239,68,68,0.07)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(239,68,68,0.15)',
    gap: 10,
  },
  locStatusText:  { color: '#FCA5A5', fontSize: 12, flex: 1 },
  locGpsBtn:      { backgroundColor: 'rgba(99,102,241,0.15)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(99,102,241,0.3)' },
  locGpsBtnText:  { color: '#A5B4FC', fontSize: 12, fontWeight: '700' },

  searchBtn: {
    minWidth: 72,
    backgroundColor: 'rgba(99,102,241,0.18)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  searchBtnText: { color: '#A5B4FC', fontSize: 13, fontWeight: '700' },

  // Filter bar
  filterBar: {
    backgroundColor: '#111318',
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  fuelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  fuelPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  fuelPillActive: {
    backgroundColor: 'rgba(99,102,241,0.15)',
    borderColor: 'rgba(99,102,241,0.4)',
  },
  fuelPillText: { color: '#9CA3AF', fontSize: 11, fontWeight: '600' },  // boosted
  fuelPillTextActive: { color: '#A5B4FC' },

  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sortGroup: { flexDirection: 'row', gap: 5, flex: 1 },
  // List / Map view toggle
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
  },
  viewToggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  viewToggleBtnActive: {
    backgroundColor: 'rgba(99,102,241,0.18)',
  },
  viewToggleBtnText:       { color: '#6B7280', fontSize: 12, fontWeight: '600' },
  viewToggleBtnTextActive: { color: '#A5B4FC', fontWeight: '700' },
  sortBtn: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  sortBtnActive: {
    backgroundColor: 'rgba(99,102,241,0.15)',
    borderColor: 'rgba(99,102,241,0.4)',
  },
  sortBtnText: { color: '#9CA3AF', fontSize: 12, fontWeight: '600' },  // boosted
  sortBtnTextActive: { color: '#A5B4FC' },
  openBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  openBtnActive: {
    backgroundColor: 'rgba(34,197,94,0.1)',
    borderColor: 'rgba(34,197,94,0.35)',
  },
  openBtnText: { color: '#9CA3AF', fontSize: 12, fontWeight: '600' },  // boosted

  // List header
  listHeader: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },

  // Summary bar (single line: N stations · from X.XXX € · GPS)
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  summaryText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  summarySrc: {
    color: '#818CF8',
    fontWeight: '700',
  },
  summaryInfoIcon: {
    color: '#4B5563',
    fontSize: 14,
    paddingLeft: 8,
  },

  // Loading / Error / Empty
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 60 },
  loadingText: { color: '#9CA3AF', fontSize: 14 },  // boosted
  errorBanner: {
    margin: 10,
    padding: 10,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
  },
  errorText: { color: '#FCA5A5', fontSize: 13 },
  emptyContainer: { flex: 1, justifyContent: 'center' },
  emptyBox: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyEmoji: { fontSize: 44, marginBottom: 4 },
  emptyTitle: { color: '#F9FAFB', fontSize: 17, fontWeight: '700' },
  emptyText: { color: '#9CA3AF', fontSize: 13, textAlign: 'center', paddingHorizontal: 36, lineHeight: 20 },  // boosted

  // Disclaimer
  disclaimer: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    backgroundColor: '#0D0F14',
  },
  disclaimerText: { color: '#374151', fontSize: 10, textAlign: 'center' },

  // (colValueHead and infoIcon removed — ⓘ is now in summaryBar)

  // Value info modal
  infoOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  infoCard: {
    backgroundColor: '#1A1D26',
    borderRadius: 14,
    padding: 18,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    gap: 10,
  },
  infoTitle: {
    color: '#F9FAFB',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  infoEmoji: {
    color: '#6366F1',
    fontSize: 12,
    fontWeight: '800',
    width: 22,
    paddingTop: 1,
  },
  infoRowTitle: {
    color: '#E5E7EB',
    fontSize: 13,
    fontWeight: '700',
  },
  infoRowDesc: {
    color: '#9CA3AF',
    fontSize: 11,
    marginTop: 2,
    lineHeight: 16,
  },
  infoDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    marginVertical: 2,
  },
  infoFormula: {
    color: '#6B7280',
    fontSize: 11,
    lineHeight: 17,
    fontFamily: 'monospace',
  },
  infoDismiss: {
    marginTop: 4,
    alignSelf: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: 'rgba(99,102,241,0.18)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.35)',
  },
  infoDismissText: {
    color: '#A5B4FC',
    fontSize: 12,
    fontWeight: '700',
  },
});
