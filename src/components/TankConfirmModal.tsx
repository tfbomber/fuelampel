import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Pressable } from 'react-native';

interface Props {
  visible: boolean;
  estimatedPercent: number;
  onConfirm: () => void;
  onAdjust: () => void;
  onClose: () => void;
}

export function TankConfirmModal({ visible, estimatedPercent, onConfirm, onAdjust, onClose }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose} accessibilityLabel="Close confirm modal">
        <Pressable style={styles.card} onPress={e => e.stopPropagation()}>
          <View style={styles.content}>
            <Text style={styles.emoji}>🚘</Text>
            <Text style={styles.title}>
              System estimates your tank is at ~<Text style={styles.highlight}>{Math.round(estimatedPercent)}%</Text>
            </Text>
            <Text style={styles.subtitle}>Is this roughly correct?</Text>
          </View>
          
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, styles.btnAdjust]} onPress={onAdjust}>
              <Text style={styles.btnAdjustText}>Adjust level</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnConfirm]} onPress={onConfirm}>
              <Text style={styles.btnConfirmText}>Looks right</Text>
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
  },
  emoji: {
    fontSize: 32,
    marginBottom: 12,
  },
  title: {
    color: '#E5E7EB',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 24,
  },
  highlight: {
    color: '#6366F1',
    fontWeight: '800',
  },
  subtitle: {
    color: '#9CA3AF',
    fontSize: 13,
    marginTop: 6,
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
