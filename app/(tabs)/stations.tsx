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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
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
  const { highlightId } = useLocalSearchParams<{ highlightId: string }>();
  const flatListRef = useRef<any>(null);

  const [sortMode, setSortMode] = useState<SortMode>('value');
  const [viewMode, setViewMode]  = useState<ViewMode>('list');
  const [localFuelType, setLocalFuelType] = useState<FuelType>(storedFuelType);
  // Tracks the last globally-stored fuelType that was synced into localFuelType.
  // Using a Ref (not state) avoids adding localFuelType to useFocusEffect deps,
  // which would re-trigger the sync every time the user taps a Pill.
  const lastSyncedStoredFuelType = useRef<FuelType>(storedFuelType);
  const [showValueInfo, setShowValueInfo] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  // ── Location / address search state ──────────────────────────────────────
  const [locQuery,    setLocQuery]    = useState('');
  const [locResults,  setLocResults]  = useState<AddressSuggestion[]>([]);
  const [locLoading,  setLocLoading]  = useState(false);
  const [locNoResult, setLocNoResult] = useState(false);
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

  // ── Sync fuel type when Stations tab gains focus ─────────────────────────
  // Only overwrites the local pill selection when the GLOBAL setting has changed
  // (e.g. user switched to Diesel in the Decide tab) since the last visit.
  // Comparing against a Ref (not state) means this effect does NOT re-fire when
  // the user taps a Pill locally, preventing the selection from being overwritten.
  useFocusEffect(
    useCallback(() => {
      if (storedFuelType !== lastSyncedStoredFuelType.current) {
        lastSyncedStoredFuelType.current = storedFuelType;
        setLocalFuelType(storedFuelType);
        if (stations.length > 0) {
          switchFuelType(storedFuelType);
        } else if (currentLocation.current) {
          refresh(currentLocation.current, true, storedFuelType);
        }
      }
    }, [storedFuelType, stations.length])  // localFuelType intentionally excluded
  );

  // -- Scroll-to-highlighted when arriving from GO decision --
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  useEffect(() => {
    if (!highlightId || stations.length === 0) return;
    setHighlightedId(highlightId);
    const idx = displayList.findIndex(s => s.id === highlightId);
    if (idx >= 0 && flatListRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.15 });
      }, 300);
    }
    const t = setTimeout(() => setHighlightedId(null), 3000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId, stations.length]);

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

  // ── Location search helpers ─────────────────────────────────────────────
  function cancelLocPending() {
    if (locDebounceRef.current) { clearTimeout(locDebounceRef.current); locDebounceRef.current = null; }
    if (locAbortRef.current)    { locAbortRef.current.abort();          locAbortRef.current    = null; }
  }

  async function startLocSearch(q: string) {
    cancelLocPending();
    setLocLoading(true);
    setLocResults([]);
    setLocNoResult(false);

    // Fast path: exactly 5-digit German PLZ
    if (/^\d{5}$/.test(q)) {
      const ac = new AbortController();
      locAbortRef.current = ac;
      try {
        const loc = await geocodePLZ(q, ac.signal);
        if (ac.signal.aborted) return;
        locAbortRef.current = null;
        setLocLoading(false);
        if (loc) {
          currentLocation.current = loc;
          setLocationLabel(`PLZ ${q}`);
          refresh(loc, true, localFuelType);
        } else {
          setLocNoResult(true);
        }
      } catch {
        if (!locAbortRef.current?.signal.aborted) {
          setLocLoading(false);
          setLocNoResult(true); // Network error — show feedback, not silent spinner
        }
      }
      return;
    }

    // Slow path: free-text address → cascade Nominatim → Photon
    const ac = new AbortController();
    locAbortRef.current = ac;
    try {
      const { results } = await searchAddressWithFallback(q, ac.signal);
      if (ac.signal.aborted) return;
      locAbortRef.current = null;
      setLocLoading(false);
      if (results.length > 0) {
        setLocResults(results);          // Always show dropdown — user selects explicitly
      } else {
        setLocNoResult(true);
      }
    } catch {
      if (!locAbortRef.current?.signal.aborted) {
        setLocLoading(false);
        setLocNoResult(true); // Network error — show feedback, not silent spinner
      }
    }
  }

  function pickLocResult(s: AddressSuggestion) {
    if (!s.loc) return;
    cancelLocPending();
    currentLocation.current = s.loc;
    setLocationLabel(s.shortName);
    setLocQuery(s.shortName);
    setLocResults([]);
    setLocLoading(false);
    Keyboard.dismiss();
    refresh(s.loc, true, localFuelType);
  }

  function clearLocSearch() {
    cancelLocPending();
    setLocQuery('');
    setLocResults([]);
    setLocLoading(false);
    setLocNoResult(false);
  }


  const onRefresh = useCallback(() => {
    const loc = currentLocation.current;
    if (loc) refresh(loc, true, localFuelType);
    else fetchViaGPS(localFuelType);
  }, [refresh, homeLocation, localFuelType]);

  // ── Fuel type switch — zero network (re-picks from cached raw prices) ────
  function handleFuelTypeChange(newType: FuelType) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
      highlighted={item.id === highlightedId}
    />
  ), [regionMedian, nearestOpen, fillUpLitres, sortMode, distanceSource, highlightedId]);

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
              setLocResults([]);
              setLocNoResult(false);
              cancelLocPending();
              const q = t.trim();
              if (q.length >= 3) {
                setLocLoading(true);
                // 400ms debounce — fires even after keyboard dismiss
                locDebounceRef.current = setTimeout(() => startLocSearch(q), 400);
              } else {
                setLocLoading(false);
              }
            }}
            returnKeyType="search"
            onSubmitEditing={() => {
              const q = locQuery.trim();
              if (q.length >= 3) startLocSearch(q);
            }}
            // onBlur: 200ms delay lets suggestion taps register; does NOT cancel debounce
            onBlur={() => setTimeout(() => setLocResults([]), 200)}
            accessibilityLabel="Location or postal code search"
          />
          {/* Clear button */}
          {locQuery.length > 0 && !locLoading && (
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
          onPress={locQuery.trim() ? () => startLocSearch(locQuery.trim()) : () => fetchViaGPS()}
          disabled={locLoading}
          accessibilityLabel={locQuery.trim() ? 'Search location' : 'Use GPS location'}
        >
          {locLoading ? (
            <ActivityIndicator size="small" color="#A5B4FC" />
          ) : (
            <Text style={styles.searchBtnText}>{locQuery.trim() ? '🔍' : '📍 GPS'}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Address suggestion dropdown ──────────────────────────────────── */}
      {locResults.length > 0 && (
        <View style={styles.locDropdown}>
          {locResults.map((s, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.locSuggestion, i > 0 && styles.locSuggestionBorder]}
              onPress={() => pickLocResult(s)}
              activeOpacity={0.7}
            >
              <Text style={styles.locSuggestionShort} numberOfLines={1}>{s.shortName}</Text>
              <Text style={styles.locSuggestionFull} numberOfLines={1}>{s.displayName}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── No-result feedback ─────────────────────────────────────────────── */}
      {locNoResult && (
        <View style={styles.locStatusBanner}>
          <Text style={styles.locStatusText}>
            {`No results for “${locQuery}”`}
          </Text>
          <TouchableOpacity onPress={() => fetchViaGPS()} style={styles.locGpsBtn}>
            <Text style={styles.locGpsBtnText}>📍 GPS</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Filter bar ─────────────────────────────────────────────────── */}
      <View style={styles.filterBar}>
        {/* Row 1: Fuel type pills */}
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

        {/* Row 2: Sort tabs + List/Map toggle — always on ONE line */}
        <View style={styles.controlRow}>
          {/* Sort tabs — hidden in map mode but occupy no space */}
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

          {/* Spacer — pushes toggle to the right in map mode */}
          {viewMode === 'map' && <View style={{ flex: 1 }} />}

          {/* List / Map toggle — always visible, always right-aligned */}
          <View style={styles.viewToggle}>
            <TouchableOpacity
              style={[styles.viewToggleBtn, viewMode === 'list' && styles.viewToggleBtnActive]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setViewMode('list'); }}
              accessibilityLabel="List view"
            >
              <Text style={[styles.viewToggleBtnText, viewMode === 'list' && styles.viewToggleBtnTextActive]}>
                📋 List
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.viewToggleBtn, viewMode === 'map' && styles.viewToggleBtnActive]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setViewMode('map'); }}
              accessibilityLabel="Map view"
            >
              <Text style={[styles.viewToggleBtnText, viewMode === 'map' && styles.viewToggleBtnTextActive]}>
                🗺️ Map
              </Text>
            </TouchableOpacity>
          </View>
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

      {/* ── Map view — always mounted when stations exist ──────────────────── */}
      {/* display:'none' hides without unmounting: MapLibre tiles & camera preserved */}
      {stations.length > 0 && (
        <View style={{ flex: 1, display: viewMode === 'map' ? 'flex' : 'none' }}>
          <StationMapView
            stations={stations}
            currentLocation={currentLocation.current}
            fuelType={localFuelType}
            nearestStation={nearestOpen}
            cheapestStation={stations.find(s => s.isOpen && s.price === cheapestPrice) ?? null}
            locationLabel={locationLabel}
          />
        </View>
      )}
      {viewMode === 'map' && stations.length === 0 && !isLoading && (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyEmoji}>🗺️</Text>
          <Text style={styles.emptyTitle}>Map ready</Text>
          <Text style={styles.emptyText}>Enter a PLZ or address above, or tap GPS.</Text>
        </View>
      )}

      {/* ── Station FlatList (list mode only) ────────────────────────────── */}
      {viewMode === 'list' && (
        <FlatList
          ref={flatListRef}
          data={displayList}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          onScrollToIndexFailed={() => {}}
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
    zIndex: 10,
    elevation: 10,  // Android: lifts above native MapLibre layer
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
    zIndex: 10,
    elevation: 10,  // Android: lifts above native MapLibre layer
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

  // Row 2 of filter bar: sort tabs + view toggle on ONE line
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
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
