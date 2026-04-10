// ====================================================
// FuelAmpel — ReasonCard Component
// Displays the explanation text beneath the traffic light.
// ====================================================

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Recommendation } from '../utils/types';

interface Props {
  reason: string;
  recommendation: Recommendation;
}

const BORDER_COLOR: Record<Recommendation, string> = {
  Go: '#22C55E',
  Wait: '#F59E0B',
  Skip: '#374151',
};

export function ReasonCard({ reason, recommendation }: Props) {
  return (
    <View style={[styles.card, { borderLeftColor: BORDER_COLOR[recommendation] }]}>
      <Text style={styles.text}>{reason}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderLeftWidth: 3,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 20,
  },
  text: {
    color: '#D1D5DB',
    fontSize: 14,
    lineHeight: 20,
  },
});
