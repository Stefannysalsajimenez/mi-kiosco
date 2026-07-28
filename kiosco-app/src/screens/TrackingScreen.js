import React, { useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import StatusBadge, { getStatus } from '../components/StatusBadge';
import { timestampMillis } from '../services/orderService';
import { useBranding } from '../context/BrandingContext';
import { hasPublicReceipt } from '../services/receiptService';
import { downloadReceipt } from '../utils/downloadReceipt';

const FLOW = [
  { key: 'pending', label: 'Pedido recibido', icon: '⏳' },
  { key: 'preparing', label: 'En preparación', icon: '🔄' },
  { key: 'ready', label: 'Listo para recoger', icon: '✅' }
];

function stepIndex(status) {
  if (status === 'done') return 2;
  return FLOW.findIndex(step => step.key === status);
}

export default function TrackingScreen({ order }) {
  const { width } = useWindowDimensions();
  const { theme } = useBranding();
  const styles = useMemo(() => createStyles(theme, width), [theme, width]);

  if (!order) {
    return (
      <View style={styles.emptyScreen}>
        <Text style={styles.emptyIcon}>📦</Text>
        <Text style={styles.emptyTitle}>Sin pedido seleccionado</Text>
        <Text style={styles.emptyText}>Abre “Mis pedidos” y selecciona uno para ver su seguimiento.</Text>
      </View>
    );
  }

  const current = getStatus(order.status);
  const currentIndex = stepIndex(order.status);
  const rejected = order.status === 'rejected';
  const millis = timestampMillis(order.createdAt);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.eyebrow}>SEGUIMIENTO EN TIEMPO REAL</Text>
      <Text style={styles.title}>Pedido {order.id.slice(-8)}</Text>
      <Text style={styles.date}>{millis ? new Date(millis).toLocaleString('es-PE') : 'Registrando fecha…'}</Text>

      <View style={styles.summary}>
        <View style={styles.summaryText}>
          <Text style={styles.summaryLabel}>Estado actual</Text>
          <Text style={[styles.currentStatus, { color: current.color }]}>{current.icon} {current.label}</Text>
        </View>
        <StatusBadge status={order.status} />
      </View>

      {rejected ? (
        <View style={styles.rejected}>
          <Text style={styles.rejectedTitle}>❌ Pedido rechazado</Text>
          <Text style={styles.rejectedText}>Comunícate con la tienda para obtener más información.</Text>
        </View>
      ) : (
        <View style={styles.timeline}>
          {FLOW.map((step, index) => {
            const completed = index <= currentIndex;
            return (
              <View key={step.key} style={styles.step}>
                <View style={[styles.stepIcon, completed && { borderColor: theme.primary, backgroundColor: theme.primarySoft }]}>
                  <Text style={styles.stepEmoji}>{step.icon}</Text>
                </View>
                <View style={styles.stepTextWrap}>
                  <Text style={[styles.stepTitle, completed && styles.stepTitleActive]}>{step.label}</Text>
                  <Text style={styles.stepText}>{completed ? 'Etapa alcanzada' : 'Pendiente'}</Text>
                </View>
                {index < FLOW.length - 1 ? <View style={[styles.line, completed && { backgroundColor: theme.primary }]} /> : null}
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.detailCard}>
        <Text style={styles.cardTitle}>Detalle</Text>
        {(order.items || []).map((item, index) => (
          <View key={`${item.productId || item.name}-${index}`} style={styles.itemRow}>
            <Text style={styles.itemName}>{item.name} ×{item.qty}</Text>
            <Text style={styles.itemPrice}>S/ {Number(item.subtotal || 0).toFixed(2)}</Text>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.total}>S/ {Number(order.total || 0).toFixed(2)}</Text>
        </View>
        {hasPublicReceipt(order) ? (
          <Pressable
            accessibilityRole="button"
            onPress={async () => {
              try {
                await downloadReceipt(order);
              } catch (error) {
                Alert.alert('Recibo', error.message);
              }
            }}
            style={({ pressed }) => [styles.receiptButton, pressed && styles.receiptPressed]}
          >
            <Text style={styles.receiptButtonText}>🧾 Abrir recibo en PDF</Text>
          </Pressable>
        ) : (
          <Text style={styles.receiptPending}>La tienda todavía no ha emitido el recibo de este pedido.</Text>
        )}
      </View>
    </ScrollView>
  );
}

function createStyles(theme, width) {
  const padding = width < 360 ? 14 : 20;
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.background },
    content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding, paddingBottom: 22 },
    emptyScreen: { flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center', padding: 35 },
    emptyIcon: { fontSize: 48 },
    emptyTitle: { color: theme.text, fontSize: 20, fontWeight: '800', marginTop: 14 },
    emptyText: { color: theme.muted, textAlign: 'center', lineHeight: 20, marginTop: 8 },
    eyebrow: { color: theme.primary, fontSize: 11, letterSpacing: 1.5, fontWeight: '800' },
    title: { color: theme.text, fontSize: width < 360 ? 24 : 27, fontWeight: '900', marginTop: 5 },
    date: { color: theme.muted, marginTop: 4 },
    summary: { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
    summaryText: { flex: 1, minWidth: 0 },
    summaryLabel: { color: theme.muted, fontSize: 12 },
    currentStatus: { fontSize: width < 360 ? 16 : 18, fontWeight: '900', marginTop: 3 },
    rejected: { backgroundColor: '#3b1818', borderColor: theme.danger, borderWidth: 1, borderRadius: 16, padding: 18, marginTop: 18 },
    rejectedTitle: { color: theme.danger, fontSize: 17, fontWeight: '900' },
    rejectedText: { color: theme.text, marginTop: 6, lineHeight: 20 },
    timeline: { marginTop: 24 },
    step: { flexDirection: 'row', minHeight: 82, position: 'relative' },
    stepIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: theme.surfaceAlt, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
    stepEmoji: { fontSize: 18 },
    stepTextWrap: { paddingLeft: 14, paddingTop: 3 },
    stepTitle: { color: theme.muted, fontWeight: '700', fontSize: 16 },
    stepTitleActive: { color: theme.text },
    stepText: { color: theme.muted, fontSize: 12, marginTop: 4 },
    line: { position: 'absolute', left: 20, top: 41, bottom: -1, width: 2, backgroundColor: theme.border },
    detailCard: { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 8 },
    cardTitle: { color: theme.text, fontSize: 17, fontWeight: '800', marginBottom: 10 },
    itemRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 7 },
    itemName: { color: theme.text, flex: 1 },
    itemPrice: { color: theme.muted },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: theme.border, marginTop: 8, paddingTop: 13 },
    totalLabel: { color: theme.text, fontWeight: '800' },
    total: { color: theme.primary, fontWeight: '900', fontSize: 19 },
    receiptButton: { marginTop: 16, borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: theme.primary, backgroundColor: theme.primarySoft },
    receiptPressed: { opacity: 0.75 },
    receiptButtonText: { color: theme.primary, fontWeight: '900' },
    receiptPending: { color: theme.muted, fontSize: 12, lineHeight: 18, marginTop: 14, textAlign: 'center' }
  });
}
