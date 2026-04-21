// ====================================================
// FuelAmpel — StationCard Component
// Shows the recommended station's key details.
// ====================================================

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Station } from '../utils/types';
import { formatPrice, formatDistance, formatRelativeTime } from '../utils/formatters';
import { t } from '../utils/i18n';

interface Props {
  station: Station;
  saving?: number;
}

export function StationCard({ station, saving }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.brandBadge}>
          <Text style={styles.brandText}>{station.brand || 'Station'}</Text>
        </View>
        <View style={styles.priceBlock}>
          <Text style={styles.price}>{formatPrice(station.price)}</Text>
          {saving !== undefined && saving > 0 && (
            <Text style={styles.saving}>−{(saving * 100).toFixed(1)}¢/L</Text>
          )}
        </View>
      </View>

      <Text style={styles.address} numberOfLines={1}>
        {station.street}, {station.place}
      </Text>

      <View style={styles.meta}>
        <Text style={styles.metaItem}>📍 {formatDistance(station.dist)}</Text>
        <Text style={styles.metaDot}>·</Text>
        <Text style={styles.metaItem}>🕐 {formatRelativeTime(station.fetchedAt)}</Text>
        <Text style={styles.metaDot}>·</Text>
        <Text style={[styles.metaItem, { color: station.isOpen ? '#22C55E' : '#EF4444' }]}>
          {station.isOpen ? t('open') : t('closed')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 20,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  brandBadge: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  brandText: {
    color: '#A5B4FC',
    fontSize: 13,
    fontWeight: '700',
  },
  priceBlock: {
    alignItems: 'flex-end',
  },
  price: {
    color: '#F9FAFB',
    fontSize: 18,
    fontWeight: '800',
  },
  saving: {
    color: '#22C55E',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
  },
  address: {
    color: '#9CA3AF',
    fontSize: 13,
    marginBottom: 10,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaItem: {
    color: '#6B7280',
    fontSize: 12,
  },
  metaDot: {
    color: '#374151',
    fontSize: 12,
  },
});
