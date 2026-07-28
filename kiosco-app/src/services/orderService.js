import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  limit,
  runTransaction,
  serverTimestamp,
  setDoc,
  where
} from 'firebase/firestore';
import { db } from './firebase';

export function subscribeProducts(onData, onError) {
  return onSnapshot(collection(db, 'products'), snapshot => {
    const products = snapshot.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .filter(item => item.active !== false)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));
    onData(products);
  }, onError);
}

export function subscribeCustomerOrders(customer, phone, onData, onError) {
  if (!customer?.trim()) {
    onData([]);
    return () => {};
  }
  const constraints = [where('customer', '==', customer.trim())];
  if (phone?.trim()) constraints.push(where('customerPhone', '==', phone.trim()));
  constraints.push(limit(30));
  const ordersQuery = query(collection(db, 'orders'), ...constraints);
  return onSnapshot(ordersQuery, snapshot => {
    const orders = snapshot.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt));
    onData(orders);
  }, onError);
}

export async function getPaymentConfig() {
  const snapshot = await getDoc(doc(db, 'config', 'payments'));
  return snapshot.exists() ? snapshot.data() : {};
}

export async function createOrder({ customer, phone, cart, paymentMethod, notes, paymentProof }) {
  const orderReference = doc(collection(db, 'orders'));

  await runTransaction(db, async transaction => {
    const products = [];
    for (const item of cart) {
      const productReference = doc(db, 'products', item.id);
      const productSnapshot = await transaction.get(productReference);
      if (!productSnapshot.exists()) throw new Error(`El producto ${item.name} ya no existe.`);
      products.push({ item, productReference, product: productSnapshot.data() || {} });
    }

    const items = [];
    for (const entry of products) {
      const { item, productReference, product } = entry;
      if (product.active === false) throw new Error(`El producto ${item.name} no está disponible.`);

      const quantity = Math.max(1, Math.trunc(Number(item.qty || 0)));
      const rawPrice = Number(product.price ?? item.price ?? 0);
      const price = Number.isFinite(rawPrice) && rawPrice >= 0 ? rawPrice : 0;
      const rawStock = product.stock;
      const hasStock = rawStock !== null && rawStock !== undefined && rawStock !== '' && Number.isFinite(Number(rawStock));
      const stock = hasStock ? Math.max(0, Math.trunc(Number(rawStock))) : null;
      if (stock !== null && stock < quantity) {
        throw new Error(`Stock insuficiente para ${item.name}. Disponible: ${stock}.`);
      }

      items.push({
        productId: item.id,
        name: String(product.name || item.name),
        price: Number(price.toFixed(2)),
        qty: quantity,
        unit: String(product.unit || item.unit || 'Unidad'),
        subtotal: Number((price * quantity).toFixed(2))
      });

      if (stock !== null) {
        transaction.update(productReference, {
          stock: stock - quantity,
          updatedAt: serverTimestamp()
        });
      }
    }

    const total = items.reduce((sum, item) => sum + item.subtotal, 0);
    transaction.set(orderReference, {
      customer: customer.trim(),
      customerPhone: phone.trim() || null,
      items,
      total: Number(total.toFixed(2)),
      itemCount: items.reduce((sum, item) => sum + item.qty, 0),
      status: 'pending',
      paymentMethod,
      paymentGroup: ['yape', 'plin'].includes(paymentMethod) ? 'wallet' : paymentMethod,
      paymentProofExpected: Boolean(paymentProof),
      notes: notes.trim().slice(0, 300) || null,
      deliveryType: 'pickup',
      deliveryAddress: null,
      scheduledDate: null,
      scheduledTime: null,
      source: 'expo',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });

  let proofWarning = '';
  if (paymentProof?.imageData) {
    try {
      await setDoc(doc(db, 'paymentProofs', orderReference.id), {
        orderId: orderReference.id,
        paymentMethod,
        imageData: paymentProof.imageData,
        fileName: String(paymentProof.fileName || 'comprobante.jpg').slice(0, 120),
        contentType: String(paymentProof.contentType || 'image/jpeg').slice(0, 80),
        encodedLength: Number(paymentProof.encodedLength || paymentProof.imageData.length),
        createdAt: serverTimestamp()
      });
    } catch (error) {
      console.warn('Comprobante de pago:', error);
      proofWarning = 'El pedido se registró, pero la imagen del pago no pudo guardarse.';
    }
  }

  void notifyBackend(orderReference.id);
  return { orderId: orderReference.id, proofWarning };
}

async function notifyBackend(orderId) {
  const baseUrl = process.env.EXPO_PUBLIC_KIOSCO_API_URL;
  if (!baseUrl || baseUrl.includes('REEMPLAZAR')) return;
  try {
    await fetch(`${baseUrl.replace(/\/$/, '')}/api/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId })
    });
  } catch (error) {
    console.warn('No se pudo notificar al administrador:', error);
  }
}

export function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}
