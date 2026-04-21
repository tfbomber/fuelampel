import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { t } from '../utils/i18n';

interface Props {
  visible: boolean;
  estimatedPercent: number;
  onConfirm: () => void;
  onAdjust: () => void;
  onClose: () => void;
}

export function TankConfirmModal({ visible, estimatedPercent, onConfirm, onAdjust, onClose }: Props) {
  const pct = Math.round(estimatedPercent);
  const titleText = t('tankConfirmTitle').replace('{pct}', String(pct));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose} accessibilityLabel={t('closeConfirmModalA11y')}>
        <Pressable style={styles.card} onPress={e => e.stopPropagation()}>
          <View style={styles.content}>
            <Text style={styles.emoji}>🚘</Text>
            <Text style={styles.title} adjustsFontSizeToFit numberOfLines={2} minimumFontScale={0.75}>{titleText}</Text>
            <Text style={styles.subtitle}>{t('tankConfirmSubtitle')}</Text>
          </View>
          
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, styles.btnAdjust]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onAdjust(); }}>
              <Text style={styles.btnAdjustText}>{t('tankConfirmAdjust')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnConfirm]} onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); onConfirm(); }}>
              <Text style={styles.btnConfirmText}>{t('tankConfirmOk')}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#1A1D26',
    borderRadius: 16,
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  content: {
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  emoji: {
    fontSize: 32,
    marginBottom: 4,
  },
  title: {
    color: '#E5E7EB',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 24,
  },
  subtitle: {
    color: '#9CA3AF',
    fontSize: 13,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  btn: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnAdjust: {
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.06)',
  },
  btnAdjustText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '600',
  },
  btnConfirm: {
    backgroundColor: 'rgba(99,102,241,0.1)',
  },
  btnConfirmText: {
    color: '#818CF8',
    fontSize: 14,
    fontWeight: '700',
  },
});
