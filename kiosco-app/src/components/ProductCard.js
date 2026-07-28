import React, { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useBranding } from '../context/BrandingContext';

export default function ProductCard({ product, quantity, onAdd, onRemove, singleColumn = false, compact = false }) {
  const { theme } = useBranding();
  const styles = useMemo(() => createStyles(theme, singleColumn, compact), [theme, singleColumn, compact]);
  const [imageFailed, setImageFailed] = useState(false);
  const stock = product.stock == null ? null : Number(product.stock);
  const unavailable = stock !== null && stock <= 0;
  const image = product.imageUrl || product.resolvedImageUrl;
  const canAdd = !unavailable && (stock === null || quantity < stock);

  return (
    <View style={[styles.card, unavailable && styles.disabled]}>
      <View style={styles.media}>
        {image && !imageFailed ? (
          <Image source={{ uri: image }} style={styles.image} resizeMode="cover" onError={() => setImageFailed(true)} />
        ) : (
          <View style={[styles.image, styles.placeholder]}>
            <Text style={styles.placeholderText}>{product.emoji || '🛍️'}</Text>
          </View>
        )}
        {unavailable ? <View style={styles.soldOut}><Text style={styles.soldOutText}>AGOTADO</Text></View> : null}
      </View>

      <View style={styles.body}>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
          <Text style={styles.description} numberOfLines={2}>{product.description || 'Producto disponible'}</Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.price}>S/ {Number(product.price || 0).toFixed(2)}</Text>
          <Text style={styles.stock}>{stock === null ? 'Disponible' : `Stock: ${stock}`}</Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Quitar ${product.name}`}
            onPress={() => onRemove(product.id)}
            disabled={!quantity}
            style={({ pressed }) => [styles.qtyButton, (!quantity || pressed) && styles.buttonMuted]}
          >
            <Text style={styles.qtyButtonText}>−</Text>
          </Pressable>
          <Text style={styles.quantity}>{quantity || 0}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Agregar ${product.name}`}
            onPress={() => onAdd(product)}
            disabled={!canAdd}
            style={({ pressed }) => [styles.qtyButton, styles.addButton, (!canAdd || pressed) && styles.buttonMuted]}
          >
            <Text style={styles.qtyButtonText}>+</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function createStyles(theme, singleColumn, compact) {
  return StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: 16,
      overflow: 'hidden',
      flex: 1,
      minWidth: 0,
      flexDirection: singleColumn ? 'row' : 'column'
    },
    disabled: { opacity: 0.58 },
    media: { width: singleColumn ? '42%' : '100%', minWidth: singleColumn ? 118 : 0, position: 'relative' },
    image: {
      width: '100%',
      height: singleColumn ? '100%' : undefined,
      minHeight: singleColumn ? 150 : 0,
      aspectRatio: singleColumn ? undefined : compact ? 1.35 : 1.45,
      backgroundColor: theme.surfaceAlt
    },
    placeholder: { alignItems: 'center', justifyContent: 'center' },
    placeholderText: { fontSize: 38 },
    soldOut: { position: 'absolute', top: 8, left: 8, backgroundColor: theme.muted, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 4 },
    soldOutText: { color: theme.white, fontSize: 9, fontWeight: '900' },
    body: { flex: 1, padding: compact ? 10 : 12, gap: compact ? 4 : 5, justifyContent: 'space-between', minWidth: 0 },
    info: { minWidth: 0 },
    name: { color: theme.text, fontSize: compact ? 14 : 15, fontWeight: '800', lineHeight: compact ? 18 : 20, minHeight: singleColumn ? 0 : compact ? 36 : 40 },
    description: { color: theme.muted, fontSize: compact ? 11 : 12, lineHeight: compact ? 15 : 17, marginTop: 5, minHeight: singleColumn ? 0 : compact ? 30 : 34 },
    footer: { marginTop: 5 },
    price: { color: theme.primary, fontSize: compact ? 16 : 18, fontWeight: '900' },
    stock: { color: theme.muted, fontSize: 11, marginTop: 2 },
    actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 7, gap: compact ? 8 : 10 },
    qtyButton: {
      width: compact ? 32 : 36,
      height: compact ? 32 : 36,
      borderRadius: 10,
      backgroundColor: theme.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.border
    },
    addButton: { backgroundColor: theme.primary, borderColor: theme.primary },
    buttonMuted: { opacity: 0.42 },
    qtyButtonText: { color: theme.white, fontSize: 21, fontWeight: '800' },
    quantity: { color: theme.text, minWidth: 18, textAlign: 'center', fontWeight: '800' }
  });
}
