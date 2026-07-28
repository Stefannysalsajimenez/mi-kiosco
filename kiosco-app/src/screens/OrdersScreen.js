import React, { useMemo } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import StatusBadge from '../components/StatusBadge';
import { timestampMillis } from '../services/orderService';
import { useBranding } from '../context/BrandingContext';
import { hasPublicReceipt } from '../services/receiptService';
import { downloadReceipt } from '../utils/downloadReceipt';

const PAYMENT = {
  cash: '💵 Efectivo',
  yape: '💜 Yape',
  plin: '💚 Plin',
  card: '💳 Tarjeta'
};

function formatDate(value) {
  const millis = timestampMillis(value);
  return millis ? new Date(millis).toLocaleString('es-PE') : 'Fecha pendiente';
}

export default function OrdersScreen({ customer, orders, onSelect }) {
  const { width } = useWindowDimensions();
  const { theme } = useBranding();
  const styles = useMemo(() => createStyles(theme, width), [theme, width]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Mis pedidos</Text>
        <Text style={styles.subtitle}>{customer ? `Cliente: ${customer}` : 'Configura tu nombre al realizar un pedido.'}</Text>
      </View>
      <FlatList
        data={orders}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <Pressable onPress={() => onSelect(item)} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderText}>
                <Text style={styles.orderId}>Pedido {item.id.slice(-8)}</Text>
                <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
              </View>
              <StatusBadge status={item.status} />
            </View>
            <Text style={styles.items} numberOfLines={3}>
              {(item.items || []).map(product => `${product.name} ×${product.qty}`).join(', ') || 'Sin detalle'}
            </Text>
            <View style={styles.footer}>
              <Text style={styles.payment}>{PAYMENT[item.paymentMethod] || item.paymentMethod || 'Pago no indicado'}</Text>
              <Text style={styles.total}>S/ {Number(item.total || 0).toFixed(2)}</Text>
            </View>
            {hasPublicReceipt(item) ? (
              <Pressable
                accessibilityRole="button"
                onPress={async event => {
                  event.stopPropagation?.();
                  try {
                    await openPublicReceipt(item);
                  } catch (error) {
                    Alert.alert('Recibo', error.message);
                  }
                }}
                style={({ pressed }) => [styles.receiptButton, pressed && styles.receiptPressed]}
              >
                <Text style={styles.receiptButtonText}>🧾 Ver o descargar recibo</Text>
              </Pressable>
            ) : (
              <Text style={styles.receiptPending}>Recibo disponible cuando la tienda lo emita.</Text>
            )}
          </Pressable>
        )}
        ListEmptyComponent={<Text style={styles.empty}>Aún no tienes pedidos asociados.</Text>}
      />
    </View>
  );
}

function createStyles(theme, width) {
  const padding = width < 360 ? 12 : 16;
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.background },
    header: { width: '100%', maxWidth: 900, alignSelf: 'center', paddingHorizontal: padding, paddingVertical: 16 },
    title: { color: theme.text, fontSize: width < 360 ? 23 : 26, fontWeight: '900' },
    subtitle: { color: theme.muted, fontSize: 13, marginTop: 4 },
    list: { width: '100%', maxWidth: 900, alignSelf: 'center', paddingHorizontal: padding, paddingBottom: 18, gap: 12 },
    card: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 16, padding: 15 },
    pressed: { opacity: 0.84 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
    cardHeaderText: { flex: 1, minWidth: 0 },
    orderId: { color: theme.text, fontWeight: '800' },
    date: { color: theme.muted, fontSize: 11, marginTop: 3 },
    items: { color: theme.text, lineHeight: 20, fontSize: 13, marginTop: 14 },
    footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, gap: 10 },
    payment: { color: theme.muted, fontSize: 12, flexShrink: 1 },
    total: { color: theme.primary, fontWeight: '900', fontSize: 17 },
    receiptButton: { marginTop: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.primary, paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center', backgroundColor: theme.primarySoft },
    receiptPressed: { opacity: 0.76 },
    receiptButtonText: { color: theme.primary, fontWeight: '900', fontSize: 13 },
    receiptPending: { color: theme.muted, fontSize: 11, marginTop: 10 },
    empty: { color: theme.muted, textAlign: 'center', marginTop: 70 }
  });
}
