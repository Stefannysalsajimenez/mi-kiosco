import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions
} from 'react-native';
import ProductCard from '../components/ProductCard';
import { useBranding } from '../context/BrandingContext';

function columnsForWidth(width) {
  if (width < 350) return 1;
  if (width < 720) return 2;
  if (width < 1024) return 3;
  return 4;
}

export default function StoreScreen({ products, loading, error, quantities, cartCount, onAdd, onRemove, onOpenCart }) {
  const { width } = useWindowDimensions();
  const { branding, theme } = useBranding();
  const [search, setSearch] = useState('');
  const columns = columnsForWidth(width);
  const compact = width < 390;
  const styles = useMemo(() => createStyles(theme, width, columns), [theme, width, columns]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es');
    if (!term) return products;
    return products.filter(product => [product.name, product.description]
      .some(value => String(value || '').toLocaleLowerCase('es').includes(term)));
  }, [products, search]);

  return (
    <View style={styles.screen}>
      <View style={styles.hero}>
        <View style={styles.brandRow}>
          <View style={styles.logoWrap}>
            {branding.storeLogoUrl ? (
              <Image source={{ uri: branding.storeLogoUrl }} style={styles.logo} resizeMode="cover" />
            ) : (
              <Text style={styles.logoEmoji}>{branding.storeEmoji}</Text>
            )}
          </View>
          <View style={styles.heroText}>
            <Text style={styles.eyebrow}>TIENDA DIGITAL</Text>
            <Text style={styles.title} numberOfLines={1}>{branding.storeName}</Text>
            {!compact ? <Text style={styles.subtitle} numberOfLines={2}>{branding.storeTagline}</Text> : null}
          </View>
        </View>
        <Pressable onPress={onOpenCart} style={({ pressed }) => [styles.cartButton, pressed && styles.pressed]}>
          <Text style={styles.cartIcon}>🛒</Text>
          {cartCount ? <View style={styles.countBadge}><Text style={styles.countText}>{cartCount}</Text></View> : null}
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar productos…"
          placeholderTextColor={theme.muted}
          style={styles.search}
          returnKeyType="search"
        />
        {search ? (
          <Pressable onPress={() => setSearch('')} hitSlop={10}>
            <Text style={styles.clearSearch}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {loading ? <ActivityIndicator color={theme.primary} style={styles.loader} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        key={`products-${columns}`}
        data={filtered}
        keyExtractor={item => item.id}
        numColumns={columns}
        contentContainerStyle={styles.list}
        columnWrapperStyle={columns > 1 ? styles.columns : undefined}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View style={styles.cardCell}>
            <ProductCard
              product={item}
              quantity={quantities[item.id] || 0}
              onAdd={onAdd}
              onRemove={onRemove}
              singleColumn={columns === 1}
              compact={compact}
            />
          </View>
        )}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>No se encontraron productos.</Text> : null}
      />
    </View>
  );
}

function createStyles(theme, width, columns) {
  const compact = width < 390;
  const horizontalPadding = width < 360 ? 10 : width < 720 ? 14 : 20;
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.background },
    hero: {
      width: '100%',
      maxWidth: 1240,
      alignSelf: 'center',
      paddingHorizontal: horizontalPadding,
      paddingTop: compact ? 8 : 12,
      paddingBottom: compact ? 10 : 14,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 10
    },
    brandRow: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 },
    logoWrap: {
      width: compact ? 42 : 50,
      height: compact ? 42 : 50,
      borderRadius: compact ? 13 : 16,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.primaryBorder,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10
    },
    logo: { width: '100%', height: '100%' },
    logoEmoji: { fontSize: compact ? 22 : 26 },
    heroText: { flex: 1, minWidth: 0 },
    eyebrow: { color: theme.primary, fontSize: compact ? 9 : 10, letterSpacing: 1.5, fontWeight: '900' },
    title: { color: theme.text, fontSize: compact ? 25 : 30, fontWeight: '900', marginTop: 1 },
    subtitle: { color: theme.muted, fontSize: 12, marginTop: 2 },
    cartButton: {
      width: compact ? 46 : 50,
      height: compact ? 46 : 50,
      borderRadius: compact ? 14 : 16,
      backgroundColor: theme.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: theme.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.24,
      shadowRadius: 8,
      elevation: 5
    },
    pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
    cartIcon: { fontSize: compact ? 20 : 22 },
    countBadge: { position: 'absolute', top: -6, right: -6, minWidth: 22, height: 22, borderRadius: 11, backgroundColor: theme.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
    countText: { color: theme.white, fontSize: 11, fontWeight: '900' },
    searchWrap: {
      width: 'auto',
      maxWidth: 1240,
      alignSelf: 'stretch',
      marginHorizontal: horizontalPadding,
      marginBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      paddingHorizontal: 13,
      minHeight: 48
    },
    searchIcon: { color: theme.muted, fontSize: 21 },
    search: { flex: 1, color: theme.text, paddingHorizontal: 10, paddingVertical: 11, fontSize: compact ? 14 : 15 },
    clearSearch: { color: theme.muted, fontSize: 15, padding: 4 },
    loader: { marginTop: 30 },
    error: { color: theme.danger, marginHorizontal: horizontalPadding, marginBottom: 10 },
    list: { width: '100%', maxWidth: 1240, alignSelf: 'center', paddingHorizontal: horizontalPadding, paddingBottom: 18 },
    columns: { gap: columns >= 3 ? 14 : 10 },
    cardCell: { flex: 1, minWidth: 0, paddingBottom: columns >= 3 ? 14 : 10 },
    empty: { color: theme.muted, textAlign: 'center', marginTop: 60 }
  });
}
