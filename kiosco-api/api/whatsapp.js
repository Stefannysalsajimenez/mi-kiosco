'use strict';

const { getAdmin, getDb } = require('./_lib/firebaseAdmin');
const { applyCors, json, readJson, requireMethod, safeError } = require('./_lib/http');
const { asDate, assertFreshOrder, normalizePhone, orderSummary } = require('./_lib/orders');

const CLAIM_TTL_MS = 2 * 60 * 1000;

function readClientKeys() {
  try {
    const parsed = JSON.parse(process.env.CALLMEBOT_CLIENT_KEYS_JSON || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    throw new Error('CALLMEBOT_CLIENT_KEYS_JSON is not valid JSON');
  }
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res, 'POST,OPTIONS')) return;
  if (!requireMethod(req, res, 'POST')) return;

  let orderRef;
  try {
    const { orderId } = await readJson(req);
    if (!orderId || !/^[A-Za-z0-9_-]{10,128}$/.test(String(orderId))) {
      return json(res, 400, { error: 'A valid orderId is required' });
    }

    const db = getDb();
    orderRef = db.collection('orders').doc(String(orderId));

    const result = await db.runTransaction(async transaction => {
      const snap = await transaction.get(orderRef);
      if (!snap.exists) throw Object.assign(new Error('Order not found'), { statusCode: 404 });

      const order = snap.data();
      assertFreshOrder(order);
      if (order.whatsappSentAt) return { state: 'sent', order };

      const claimedAt = asDate(order.whatsappClaimedAt);
      if (claimedAt && Date.now() - claimedAt.getTime() < CLAIM_TTL_MS) {
        return { state: 'processing', order };
      }

      const phone = normalizePhone(order.customerPhone);
      if (!phone) throw Object.assign(new Error('The order has no customer phone'), { statusCode: 409 });

      const apiKey = readClientKeys()[phone];
      if (!apiKey) {
        throw Object.assign(new Error('Customer has not activated CallMeBot opt-in'), { statusCode: 409 });
      }

      transaction.update(orderRef, {
        whatsappClaimedAt: getAdmin().firestore.FieldValue.serverTimestamp()
      });
      return { state: 'claimed', order, phone, apiKey };
    });

    if (result.state === 'sent') return json(res, 200, { ok: true, alreadySent: true });
    if (result.state === 'processing') return json(res, 202, { ok: true, processing: true });

    const url = new URL('https://api.callmebot.com/whatsapp.php');
    url.searchParams.set('phone', result.phone);
    url.searchParams.set('apikey', result.apiKey);
    url.searchParams.set('text', orderSummary(result.order));

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'Kiosco/1.0' },
      signal: AbortSignal.timeout(12_000)
    });

    const text = await response.text();
    if (!response.ok) {
      throw Object.assign(new Error(`CallMeBot rejected the request: ${response.status}`), { statusCode: 502 });
    }

    await orderRef.update({
      whatsappClaimedAt: getAdmin().firestore.FieldValue.delete(),
      whatsappSentAt: getAdmin().firestore.FieldValue.serverTimestamp(),
      whatsappLastAttemptAt: getAdmin().firestore.FieldValue.serverTimestamp()
    });

    return json(res, 200, { ok: true, providerResponse: text.slice(0, 160) });
  } catch (error) {
    if (orderRef) {
      try {
        await orderRef.update({
          whatsappClaimedAt: getAdmin().firestore.FieldValue.delete(),
          whatsappLastAttemptAt: getAdmin().firestore.FieldValue.serverTimestamp()
        });
      } catch { /* preserve the original error */ }
    }
    return json(res, error.statusCode || 500, { error: safeError(error) });
  }
};
