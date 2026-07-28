import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

const STATUS = {
  pending: { label: 'Pendiente', icon: '⏳', color: colors.warning },
  preparing: { label: 'En preparación', icon: '🔄', color: colors.info },
  ready: { label: 'Listo', icon: '✅', color: colors.success },
  done: { label: 'Completado', icon: '✅', color: colors.success },
  rejected: { label: 'Rechazado', icon: '❌', color: colors.danger }
};

export function getStatus(status) {
  return STATUS[status] || { label: status || 'Pendiente', icon: '•', color: colors.muted };
}

export default function StatusBadge({ status }) {
  const meta = getStatus(status);
  return (
    <View style={[styles.badge, { borderColor: meta.color, backgroundColor: `${meta.color}22` }]}>
      <Text style={[styles.text, { color: meta.color }]}>{meta.icon} {meta.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  text: { fontSize: 11, fontWeight: '800' }
});
