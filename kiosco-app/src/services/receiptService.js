import { Linking } from 'react-native';

function storeBaseUrl() {
  const value = String(process.env.EXPO_PUBLIC_KIOSCO_STORE_URL || 'https://mi-kiosco-c7313.web.app').trim().replace(/\/$/, '');
  return /^https?:\/\//i.test(value) ? value : 'https://mi-kiosco-c7313.web.app';
}

function apiBaseUrl() {
  const value = String(process.env.EXPO_PUBLIC_KIOSCO_API_URL || '').trim().replace(/\/$/, '');
  if (!/^https:\/\//i.test(value) || value.includes('REEMPLAZAR')) return '';
  return value;
}

export function hasPublicReceipt(order) {
  return Boolean(order?.id && order?.billing?.public === true && order?.billing?.publicToken);
}

export function publicReceiptUrl(order) {
  if (!hasPublicReceipt(order)) return '';
  const base = apiBaseUrl();
  if (base) return `${base}/api/boleta?orderId=${encodeURIComponent(order.id)}&token=${encodeURIComponent(order.billing.publicToken)}`;
  return `${storeBaseUrl()}/?receiptOrder=${encodeURIComponent(order.id)}&receiptToken=${encodeURIComponent(order.billing.publicToken)}`;
}

export async function openPublicReceipt(order) {
  const url = publicReceiptUrl(order);
  if (!url) {
    throw new Error('El recibo aún no está disponible.');
  }
  const supported = await Linking.canOpenURL(url);
  if (!supported) throw new Error('El dispositivo no puede abrir el recibo.');
  await Linking.openURL(url);
}
