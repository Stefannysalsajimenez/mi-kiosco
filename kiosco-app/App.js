import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, SafeAreaView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import CartSheet from './src/components/CartSheet';
import OrderModal from './src/components/OrderModal';
import OrdersScreen from './src/screens/OrdersScreen';
import StoreScreen from './src/screens/StoreScreen';
import TrackingScreen from './src/screens/TrackingScreen';
import { BrandingProvider, useBranding } from './src/context/BrandingContext';
import {
  createOrder,
  getPaymentConfig,
  subscribeCustomerOrders,
  subscribeProducts
} from './src/services/orderService';

const PROFILE_KEY = 'kiosco_client_profile';

const TABS = [
  { key: 'store', label: 'Tienda', icon: '🏪' },
  { key: 'orders', label: 'Pedidos', icon: '🧾' },
  { key: 'tracking', label: 'Seguimiento', icon: '📍' }
];

export default function App() {
  return (
    <BrandingProvider>
      <AppShell />
    </BrandingProvider>
  );
}

function AppShell() {
  const { width } = useWindowDimensions();
  const { theme } = useBranding();
  const styles = useMemo(() => createStyles(theme, width), [theme, width]);
  const [tab, setTab] = useState('store');
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState('');
  const [cart, setCart] = useState([]);
  const [cartVisible, setCartVisible] = useState(false);
  const [orderVisible, setOrderVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [customer, setCustomer] = useState('');
  const [phone, setPhone] = useState('');
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [paymentsConfig, setPaymentsConfig] = useState({});

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(PROFILE_KEY)
      .then(raw => raw ? JSON.parse(raw) : null)
      .then(profile => {
        if (!mounted || !profile) return;
        setCustomer(profile.customer || '');
        setPhone(profile.phone || '');
      })
      .catch(error => console.warn('Perfil local:', error));

    getPaymentConfig()
      .then(config => mounted && setPaymentsConfig(config))
      .catch(error => console.warn('Métodos de pago:', error));

    const unsubscribe = subscribeProducts(
      data => {
        setProducts(data);
        setProductsLoading(false);
        setProductsError('');
      },
      error => {
        setProductsError(error.message || 'No se pudieron cargar los productos.');
        setProductsLoading(false);
      }
    );

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeCustomerOrders(
      customer,
      phone,
      data => {
        setOrders(data);
        setSelectedOrder(current => {
          if (!data.length) return null;
          if (!current) return data[0];
          return data.find(order => order.id === current.id) || data[0];
        });
      },
      error => console.warn('Pedidos del cliente:', error)
    );
    return unsubscribe;
  }, [customer, phone]);

  const quantities = useMemo(
    () => Object.fromEntries(cart.map(item => [item.id, item.qty])),
    [cart]
  );
  const cartCount = useMemo(() => cart.reduce((sum, item) => sum + item.qty, 0), [cart]);
  const total = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.price || 0) * item.qty, 0),
    [cart]
  );

  function addProduct(product) {
    setCart(current => {
      const existing = current.find(item => item.id === product.id);
      const stock = product.stock == null ? null : Number(product.stock);
      if (existing) {
        if (stock !== null && existing.qty >= stock) return current;
        return current.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item);
      }
      if (stock !== null && stock <= 0) return current;
      return [...current, { ...product, qty: 1 }];
    });
  }

  function removeProduct(productId) {
    setCart(current => current
      .map(item => item.id === productId ? { ...item, qty: item.qty - 1 } : item)
      .filter(item => item.qty > 0));
  }

  function openCheckout() {
    if (!cart.length) return;
    setCartVisible(false);
    setOrderVisible(true);
  }

  async function submitOrder(data) {
    setSubmitting(true);
    try {
      // KIOSCO_FINAL:ORDER_RESULT
      const orderResult = await createOrder({ ...data, cart });
      const orderId = typeof orderResult === 'string' ? orderResult : orderResult.orderId;
      const proofWarning = typeof orderResult === 'object' ? orderResult.proofWarning : '';
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify({ customer: data.customer, phone: data.phone }));
      const pendingOrder = {
        id: orderId,
        customer: data.customer,
        customerPhone: data.phone,
        items: cart.map(item => ({
          productId: item.id,
          name: item.name,
          price: item.price,
          qty: item.qty,
          subtotal: Number(item.price || 0) * item.qty
        })),
        total,
        paymentMethod: data.paymentMethod,
        status: 'pending',
        createdAt: new Date()
      };
      setCustomer(data.customer);
      setPhone(data.phone);
      setSelectedOrder(pendingOrder);
      setCart([]);
      setOrderVisible(false);
      setTab('tracking');
      Alert.alert('Pedido enviado', `Tu pedido ${orderId.slice(-8)} fue registrado correctamente.${proofWarning ? `\n\n${proofWarning}` : ''}`);
    } catch (error) {
      Alert.alert('No se pudo enviar', error.message || 'Ocurrió un error al registrar el pedido.');
    } finally {
      setSubmitting(false);
    }
  }

  function selectOrder(order) {
    setSelectedOrder(order);
    setTab('tracking');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" backgroundColor={theme.background} />
      <View style={styles.content}>
        {tab === 'store' ? (
          <StoreScreen
            products={products}
            loading={productsLoading}
            error={productsError}
            quantities={quantities}
            cartCount={cartCount}
            onAdd={addProduct}
            onRemove={removeProduct}
            onOpenCart={() => setCartVisible(true)}
          />
        ) : null}
        {tab === 'orders' ? (
          <OrdersScreen customer={customer} orders={orders} onSelect={selectOrder} />
        ) : null}
        {tab === 'tracking' ? (
          <TrackingScreen order={selectedOrder || orders[0] || null} />
        ) : null}
      </View>

      <View style={styles.navOuter}>
        <View style={styles.nav}>
          {TABS.map(item => {
            const active = tab === item.key;
            return (
              <Pressable key={item.key} onPress={() => setTab(item.key)} style={styles.navItem}>
                <Text style={styles.navIcon}>{item.icon}</Text>
                <Text numberOfLines={1} style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
                {active ? <View style={styles.navIndicator} /> : null}
              </Pressable>
            );
          })}
          <Pressable onPress={() => setCartVisible(true)} style={styles.navItem}>
            <Text style={styles.navIcon}>🛒</Text>
            <Text numberOfLines={1} style={styles.navLabel}>Carrito</Text>
            {cartCount ? <View style={styles.cartBadge}><Text style={styles.cartBadgeText}>{cartCount}</Text></View> : null}
          </Pressable>
        </View>
      </View>

      <CartSheet
        visible={cartVisible}
        cart={cart}
        total={total}
        onClose={() => setCartVisible(false)}
        onAdd={addProduct}
        onRemove={removeProduct}
        onClear={() => setCart([])}
        onCheckout={openCheckout}
      />
      <OrderModal
        visible={orderVisible}
        initialCustomer={customer}
        initialPhone={phone}
        total={total}
        paymentsConfig={paymentsConfig}
        submitting={submitting}
        onClose={() => !submitting && setOrderVisible(false)}
        onSubmit={submitOrder}
      />
    </SafeAreaView>
  );
}

function createStyles(theme, width) {
  const compact = width < 360;
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.background },
    content: { flex: 1, minHeight: 0 },
    navOuter: {
      backgroundColor: theme.background,
      paddingHorizontal: compact ? 8 : 12,
      paddingTop: 6,
      paddingBottom: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border
    },
    nav: {
      alignSelf: 'center',
      width: '100%',
      maxWidth: 760,
      minHeight: compact ? 58 : 64,
      borderRadius: 18,
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.22,
      shadowRadius: 10,
      elevation: 8
    },
    navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: compact ? 54 : 60, position: 'relative', paddingHorizontal: 1 },
    navIcon: { fontSize: compact ? 18 : 20 },
    navLabel: { color: theme.muted, fontSize: compact ? 9 : 10, marginTop: 2, fontWeight: '700', maxWidth: '100%' },
    navLabelActive: { color: theme.primary },
    navIndicator: { position: 'absolute', bottom: 1, width: 24, height: 3, borderRadius: 2, backgroundColor: theme.primary },
    cartBadge: { position: 'absolute', top: 3, right: compact ? 8 : 12, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: theme.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
    cartBadgeText: { color: theme.white, fontSize: 9, fontWeight: '900' }
  });
}
