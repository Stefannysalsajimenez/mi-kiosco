'use strict';

function asDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function assertFreshOrder(order, maxMinutes = 15) {
  const createdAt = asDate(order.createdAt);
  if (!createdAt) throw Object.assign(new Error('Order has no creation timestamp'), { statusCode: 409 });
  const ageMs = Date.now() - createdAt.getTime();
  if (ageMs < -60_000 || ageMs > maxMinutes * 60_000) {
    throw Object.assign(new Error('Order is outside the allowed notification window'), { statusCode: 409 });
  }
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (/^9\d{8}$/.test(digits)) return `51${digits}`;
  return digits;
}

function money(value) {
  return `S/ ${Number(value || 0).toFixed(2)}`;
}

function orderSummary(order) {
  const storeName = String(process.env.WHATSAPP_STORE_NAME || 'Kiosco').trim() || 'Kiosco';
  const rows = (order.items || []).map(item => `• ${item.name} x${item.qty}`).join('\n');
  return [
    `${storeName}: Hola ${order.customer || 'cliente'}, recibimos tu pedido.`,
    rows,
    `Total: ${money(order.total)}`,
    `Pago: ${order.paymentMethod || 'No indicado'}`,
    'Te avisaremos cuando cambie su estado.'
  ].filter(Boolean).join('\n');
}

module.exports = { asDate, assertFreshOrder, normalizePhone, orderSummary };
