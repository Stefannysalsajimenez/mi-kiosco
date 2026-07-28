import React, { useMemo } from 'react';
import { Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useBranding } from '../context/BrandingContext';

export default function CartSheet({ visible, cart, total, onClose, onAdd, onRemove, onClear, onCheckout }) {
  const { width } = useWindowDimensions();
  const { theme } = useBranding();
  const styles = useMemo(() => createStyles(theme, width), [theme, width]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Mi carrito</Text>
              <Text style={styles.subtitle}>{cart.reduce((sum, item) => sum + item.qty, 0)} productos</Text>
            </View>
            <Pressable onPress={onClose} style={styles.close}><Text style={styles.closeText}>✕</Text></Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {!cart.length ? <Text style={styles.empty}>Tu carrito está vacío.</Text> : cart.map(item => (
              <View key={item.id} style={styles.row}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                  <Text style={styles.itemPrice}>S/ {Number(item.price || 0).toFixed(2)} c/u</Text>
                </View>
                <View style={styles.rowBottom}>
                  <View style={styles.controls}>
                    <Pressable onPress={() => onRemove(item.id)} style={styles.smallButton}><Text style={styles.buttonText}>−</Text></Pressable>
                    <Text style={styles.qty}>{item.qty}</Text>
                    <Pressable onPress={() => onAdd(item)} style={[styles.smallButton, styles.add]}><Text style={styles.buttonText}>+</Text></Pressable>
                  </View>
                  <Text style={styles.lineTotal}>S/ {(Number(item.price || 0) * item.qty).toFixed(2)}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={styles.footer}>
            <View style={styles.totalRow}><Text style={styles.totalLabel}>Total</Text><Text style={styles.total}>S/ {total.toFixed(2)}</Text></View>
            <Pressable disabled={!cart.length} onPress={onCheckout} style={[styles.checkout, !cart.length && styles.disabled]}>
              <Text style={styles.checkoutText}>Continuar pedido</Text>
            </Pressable>
            <Pressable disabled={!cart.length} onPress={onClear} style={styles.clear}><Text style={styles.clearText}>Vaciar carrito</Text></Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function createStyles(theme, width) {
  const padding = width < 360 ? 14 : 18;
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.background },
    container: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center' },
    header: { flexDirection: 'row', justifyContent: 'space-between', padding, borderBottomWidth: 1, borderColor: theme.border },
    title: { color: theme.text, fontSize: 22, fontWeight: '800' },
    subtitle: { color: theme.muted, marginTop: 3 },
    close: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: theme.surfaceAlt },
    closeText: { color: theme.text, fontSize: 18 },
    list: { padding, gap: 12, flexGrow: 1 },
    empty: { color: theme.muted, textAlign: 'center', marginTop: 60 },
    row: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, padding: 14, borderRadius: 14 },
    itemInfo: { marginBottom: 10 },
    itemName: { color: theme.text, fontWeight: '700' },
    itemPrice: { color: theme.muted, fontSize: 12, marginTop: 3 },
    rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
    controls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    smallButton: { width: 34, height: 34, borderRadius: 9, backgroundColor: theme.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
    add: { backgroundColor: theme.primary },
    buttonText: { color: theme.white, fontWeight: '800', fontSize: 18 },
    qty: { color: theme.text, fontWeight: '700', minWidth: 18, textAlign: 'center' },
    lineTotal: { color: theme.primary, fontWeight: '900', flexShrink: 0 },
    footer: { padding, borderTopWidth: 1, borderColor: theme.border, gap: 10 },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    totalLabel: { color: theme.text, fontSize: 17, fontWeight: '700' },
    total: { color: theme.primary, fontSize: 24, fontWeight: '900' },
    checkout: { backgroundColor: theme.primary, padding: 15, borderRadius: 13, alignItems: 'center' },
    checkoutText: { color: theme.white, fontWeight: '800', fontSize: 16 },
    clear: { alignItems: 'center', padding: 10 },
    clearText: { color: theme.danger, fontWeight: '700' },
    disabled: { opacity: 0.45 }
  });
}
