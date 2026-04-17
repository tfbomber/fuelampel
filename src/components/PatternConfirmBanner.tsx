// ====================================================
// FuelAmpel — PatternConfirmBanner Component
// Non-modal, one-time-per-pattern inline card that
// asks the user to confirm a detected weekly trip.
// ====================================================

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { TripPattern } from '../utils/types';

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface PatternConfirmBannerProps {
  pattern: TripPattern;
  onConfirm: () => void;    // user tapped "Yes"
  onReject: () => void;     // user tapped "Not quite"
  onDismiss: () => void;    // user tapped "Ignore"
}

export function PatternConfirmBanner({
  pattern,
  onConfirm,
  onReject,
  onDismiss,
}: PatternConfirmBannerProps) {
  const day = DOW_LABELS[pattern.dayOfWeek] ?? '—';
  const km  = Math.round(pattern.approxRoundTripKm);

  return (
    <View style={s.card}>
      <View style={s.topRow}>
        <Text style={s.icon}>📍</Text>
        <View style={s.textCol}>
          <Text style={s.title}>Regular trip detected</Text>
          <Text style={s.body}>
            Every <Text style={s.highlight}>{day}</Text> you drive approx.{' '}
            <Text style={s.highlight}>{km} km</Text>.{'\n'}
            Should I include this in your fuel estimate?
          </Text>
        </View>
      </View>
      <View style={s.btnRow}>
        <TouchableOpacity style={[s.btn, s.btnYes]} onPress={onConfirm} activeOpacity={0.8}>
          <Text style={s.btnYesText}>✓ Yes</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.btn, s.btnNo]} onPress={onReject} activeOpacity={0.8}>
          <Text style={s.btnNoText}>Not quite</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.btn, s.btnIgnore]} onPress={onDismiss} activeOpacity={0.8}>
          <Text style={s.btnIgnoreText}>Ignore</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    backgroundColor: 'rgba(99,102,241,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.25)',
    borderRadius: 16,
    padding: 16,
    gap: 14,
  },
  topRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  icon:   { fontSize: 22, marginTop: 2 },
  textCol: { flex: 1, gap: 4 },
  title:  { color: '#E0E7FF', fontSize: 13, fontWeight: '700' },
  body:   { color: '#9CA3AF', fontSize: 13, lineHeight: 19 },
  highlight: { color: '#A5B4FC', fontWeight: '700' },
  btnRow: { flexDirection: 'row', gap: 8 },
  btn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
  },
  btnYes:       { backgroundColor: 'rgba(99,102,241,0.25)', borderColor: '#6366F1' },
  btnNo:        { backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.12)' },
  btnIgnore:    { backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.08)' },
  btnYesText:    { color: '#A5B4FC', fontWeight: '700', fontSize: 13 },
  btnNoText:     { color: '#9CA3AF', fontWeight: '600', fontSize: 12 },
  btnIgnoreText: { color: '#4B5563', fontWeight: '600', fontSize: 12 },
});
