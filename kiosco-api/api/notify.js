'use strict';

const { getAdmin, getDb } = require('./_lib/firebaseAdmin');
const { applyCors, json, readJson, requireMethod, safeError } = require('./_lib/http');
const { asDate, assertFreshOrder } = require('./_lib/orders');

const INVALID_TOKEN_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered'
]);
const CLAIM_TTL_MS = 2 * 60 * 1000;

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
    const adminConfigRef = db.collection('config').doc('admin');

    const payload = await db.runTransaction(async transaction => {
      const [orderSnap, configSnap] = await Promise.all([
        transaction.get(orderRef),
        transaction.get(adminConfigRef)
      ]);

      if (!orderSnap.exists) {
        throw Object.assign(new Error('Order not found'), { statusCode: 404 });
      }

      const order = orderSnap.data();
      assertFreshOrder(order);

      if (order.notificationSentAt) {
        return { state: 'sent', order, tokens: [] };
      }

      const claimedAt = asDate(order.notificationClaimedAt);
      if (claimedAt && Date.now() - claimedAt.getTime() < CLAIM_TTL_MS) {
        return { state: 'processing', order, tokens: [] };
      }

      const config = configSnap.exists ? configSnap.data() : {};
      const tokens = Array.from(new Set([
        ...(Array.isArray(config.fcmTokens) ? config.fcmTokens : []),
        ...(config.fcmToken ? [config.fcmToken] : [])
      ].map(String).filter(Boolean)));

      transaction.update(orderRef, {
        notificationClaimedAt: getAdmin().firestore.FieldValue.serverTimestamp()
      });

      return { state: 'claimed', order, tokens };
    });

    if (payload.state === 'sent') {
      return json(res, 200, { ok: true, alreadySent: true, sent: 0 });
    }
    if (payload.state === 'processing') {
      return json(res, 202, { ok: true, processing: true, sent: 0 });
    }

    if (!payload.tokens.length) {
      await orderRef.update({
        notificationClaimedAt: getAdmin().firestore.FieldValue.delete()
      });
      return json(res, 200, { ok: true, sent: 0, warning: 'No admin FCM tokens are configured' });
    }

    const title = 'Nuevo pedido en Kiosco';
    const body = `${payload.order.customer || 'Cliente'} · S/ ${Number(payload.order.total || 0).toFixed(2)}`;
    const publicUrl = (process.env.PUBLIC_STORE_URL || 'https://mi-kiosco-c7313.web.app').replace(/\/$/, '');

    const response = await getAdmin().messaging().sendEachForMulticast({
      tokens: payload.tokens,
      data: {
        type: 'new-order',
        orderId: String(orderId),
        title,
        body,
        url: `${publicUrl}/#admin-orders`,
        icon: `${publicUrl}/icons/icon-192.png`,
        badge: `${publicUrl}/icons/icon-96.png`
      },
      webpush: {
        headers: { Urgency: 'high' },
        fcmOptions: { link: `${publicUrl}/#admin-orders` }
      }
    });

    const invalidTokens = [];
    response.responses.forEach((item, index) => {
      if (!item.success && INVALID_TOKEN_CODES.has(item.error?.code)) {
        invalidTokens.push(payload.tokens[index]);
      }
    });

    const batch = db.batch();
    const notificationResult = {
      notificationClaimedAt: getAdmin().firestore.FieldValue.delete(),
      notificationSuccessCount: response.successCount,
      notificationFailureCount: response.failureCount,
      notificationLastAttemptAt: getAdmin().firestore.FieldValue.serverTimestamp()
    };
    if (response.successCount > 0) {
      notificationResult.notificationSentAt = getAdmin().firestore.FieldValue.serverTimestamp();
    }
    batch.update(orderRef, notificationResult);
    if (invalidTokens.length) {
      batch.set(adminConfigRef, {
        fcmTokens: getAdmin().firestore.FieldValue.arrayRemove(...invalidTokens)
      }, { merge: true });
    }
    await batch.commit();

    if (response.successCount === 0) {
      return json(res, 502, {
        error: 'FCM did not accept the notification for any configured token',
        sent: 0,
        failed: response.failureCount,
        invalidTokensRemoved: invalidTokens.length
      });
    }

    return json(res, 200, {
      ok: true,
      sent: response.successCount,
      failed: response.failureCount,
      invalidTokensRemoved: invalidTokens.length
    });
  } catch (error) {
    if (orderRef) {
      try {
        await orderRef.update({ notificationClaimedAt: getAdmin().firestore.FieldValue.delete() });
      } catch { /* preserve the original error */ }
    }
    return json(res, error.statusCode || 500, { error: safeError(error) });
  }
};
