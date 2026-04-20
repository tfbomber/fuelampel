// ====================================================
// FuelAmpel — StationListItem  (Clean Card v2)
//
// Layout:  [Rank●]  [Brand / dist]  [Price / value]  [🗺]
//
// Price mode  : price colored vs area median, no side-label
// Distance mode: same price display, no side-label
// Value mode  : price + value badge (★ +X.X€ or 📍 Base)
// Closed       : full row 40% opacity, "CLOSED" in sub-line
// ====================================================

import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
} from 'react-native';
import { Station } from '../utils/types';
import { computeNetVsNearest, formatNetVsNearest } from '../utils/ranking';
import { openGoogleMapsNavigation } from '../utils/navigation';
import { t } from '../utils/i18n';

type DisplayMode = 'price' | 'distance' | 'value';

interface Props {
  station: Station;
  regionMedian: number;       // area price median — used to colour price text
  nearest: Station | null;    // nearest open station (Value mode baseline)
  fillUpLitres: number;       // user's tank capacity (Settings → Shadow Tank)
  rank: number;
  displayMode: DisplayMode;
  distanceSource: 'road' | 'estimated';
  highlighted?: boolean;      // true = scrolled-to from GO decision
}

// ── Price colouring (vs area median) ─────────────────────────────────────────

function priceColor(price: number, median: number): string {
  const d = price - median;
  if (d <= -0.015) return '#22C55E';   // below avg → green
  if (d <=  0.015) return '#F59E0B';   // near avg  → amber
  return '#EF4444';                    // above avg → red
}

function rankDotColors(price: number | null, median: number) {
  if (price === null) return { bg: 'rgba(255,255,255,0.06)', text: '#6B7280' };
  const d = price - median;
  if (d <= -0.015) return { bg: 'rgba(34,197,94,0.18)',   text: '#22C55E' };
  if (d <=  0.015) return { bg: 'rgba(245,158,11,0.18)',  text: '#F59E0B' };
  return                  { bg: 'rgba(239,68,68,0.18)',   text: '#EF4444' };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StationListItem({
  station, regionMedian, nearest, fillUpLitres,
  rank, displayMode, distanceSource, highlighted = false,
}: Props) {
  const closed = !station.isOpen;
  const price  = station.price;
  const distKm = station.dist;

  const dot = rankDotColors(closed ? null : price, regionMedian);
  const pColor = (price !== null && !closed)
    ? priceColor(price, regionMedian)
    : '#4B5563';

  // ── Value badge (only in value mode, open stations) ──
  let valueBadge: React.ReactNode = null;
  if (displayMode === 'value' && price !== null && !closed) {
    const label     = formatNetVsNearest(station, nearest, fillUpLitres);
    const net       = computeNetVsNearest(station, nearest, fillUpLitres);
    const isBase    = station.id === nearest?.id;
    const badgeClr  = isBase ? '#818CF8' : net >= 0 ? '#22C55E' : '#F87171';
    const badgeBg   = isBase
      ? 'rgba(99,102,241,0.12)'
      : net >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)';
    valueBadge = (
      <View style={[badge.wrap, { backgroundColor: badgeBg, borderColor: badgeClr + '55' }]}>
        <Text style={[badge.text, { color: badgeClr }]}>{label}</Text>
      </View>
    );
  }

  const distLabel = distanceSource === 'road'
    ? `${distKm} km`
    : `~${distKm} km`;

  async function onNavigate() {
    if (closed) return;
    await openGoogleMapsNavigation(
      station.lat, station.lng,
      `${station.brand || station.name} ${station.street}`
    );
  }

  return (
    <View style={[styles.card, closed && styles.cardClosed, highlighted && styles.cardHighlighted]}>

      {/* ── Rank dot ──────────────────────────────────── */}
      <View style={[styles.rankDot, { backgroundColor: dot.bg }]}>
        <Text style={[styles.rankNum, { color: dot.text }]}>{rank}</Text>
      </View>

      {/* ── Brand + distance ──────────────────────────── */}
      <View style={styles.mainCol}>
        <Text style={[styles.brand, closed && styles.brandClosed]} numberOfLines={1}>
          {station.brand || station.name}
        </Text>
        <Text style={styles.subLine} numberOfLines={1}>
          {`${distLabel}${closed ? `  ·  ${t('closed').toUpperCase()}` : ''}  ·  ${station.street}, ${station.place}`}
        </Text>
      </View>

      {/* ── Price + optional value badge ──────────────── */}
      <View style={styles.rightCol}>
        {price !== null ? (
          <Text style={[styles.price, { color: pColor }, closed && styles.priceClosed]}>
            {price.toFixed(3)}
            <Text style={styles.priceCurrency}>€</Text>
          </Text>
        ) : (
          <Text style={styles.priceNA}>N/A</Text>
        )}
        {valueBadge}
      </View>

      {/* ── Map button (hidden for closed stations) */}
      {closed ? (
        <View style={[styles.mapBtn, styles.mapBtnClosed]}>
          <Text style={styles.mapIconClosed}>—</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.mapBtn}
          onPress={onNavigate}
          activeOpacity={0.7}
          accessibilityLabel={`Navigate to ${station.brand || station.name}`}
        >
          <Text style={styles.mapIcon}>🗺️</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Badge sub-styles ──────────────────────────────────────────────────────────

const badge = StyleSheet.create({
  wrap: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1, marginTop: 4 },
  text: { fontSize: 11, fontWeight: '800' },
});

// ── Main styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    gap: 12,
    backgroundColor: 'transparent',
  },
  cardClosed: {
    opacity: 0.4,
  },
  cardHighlighted: {
    backgroundColor: 'rgba(99,102,241,0.12)',
    borderLeftWidth: 3,
    borderLeftColor: '#6366F1',
  },

  // Rank
  rankDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rankNum: {
    fontSize: 12,
    fontWeight: '800',
  },

  // Brand + sub-line
  mainCol: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  brand: {
    color: '#F3F4F6',
    fontSize: 15,
    fontWeight: '800',
  },
  brandClosed: {
    textDecorationLine: 'line-through',
    color: '#6B7280',
  },
  subLine: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '500',
  },

  // Price
  rightCol: {
    alignItems: 'flex-end',
    gap: 0,
    flexShrink: 0,
  },
  price: {
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  priceCurrency: {
    fontSize: 12,
    fontWeight: '600',
  },
  priceClosed: {
    textDecorationLine: 'line-through',
  },
  priceNA: {
    color: '#4B5563',
    fontSize: 14,
    fontWeight: '600',
  },

  // Map button
  mapBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(99,102,241,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.2)',
  },
  mapBtnClosed: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: 'transparent',
  },
  mapIcon: {
    fontSize: 17,
  },
  mapIconClosed: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '700',
  },
});
