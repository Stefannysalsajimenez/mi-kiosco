'use strict';

const crypto = require('node:crypto');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { getAdmin, getDb } = require('./_lib/firebaseAdmin');
const { requireAdmin } = require('./_lib/auth');
const { applyCors, json, readJson, safeError } = require('./_lib/http');
const { asDate } = require('./_lib/orders');

const PAYMENT_LABELS = Object.freeze({
  cash: 'Efectivo',
  yape: 'Yape',
  plin: 'Plin',
  card: 'Tarjeta'
});

function money(value) {
  return `S/ ${Number(value || 0).toFixed(2)}`;
}

function safeText(value, fallback = '-') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function formatNumber(series, number) {
  return `${safeText(series, 'B001')}-${String(number).padStart(8, '0')}`;
}

function validOrderId(value) {
  return /^[A-Za-z0-9_-]{10,128}$/.test(String(value || ''));
}

function createPublicToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function publicReceiptUrl(req, orderId, token) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const forwardedHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const base = forwardedHost ? `${forwardedProto}://${forwardedHost}` : '';
  return `${base}/api/boleta?orderId=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}`;
}

async function loadConfiguration(db) {
  const [billingSnapshot, themeSnapshot] = await Promise.all([
    db.collection('config').doc('billing').get(),
    db.collection('config').doc('theme').get()
  ]);
  return {
    billing: billingSnapshot.exists ? billingSnapshot.data() : {},
    theme: themeSnapshot.exists ? themeSnapshot.data() : {}
  };
}

async function reserveReceipt(db, orderId) {
  const orderRef = db.collection('orders').doc(orderId);
  const configRef = db.collection('config').doc('billing');

  return db.runTransaction(async transaction => {
    const [orderSnapshot, configSnapshot] = await Promise.all([
      transaction.get(orderRef),
      transaction.get(configRef)
    ]);

    if (!orderSnapshot.exists) {
      throw Object.assign(new Error('Pedido no encontrado'), { statusCode: 404 });
    }

    const order = orderSnapshot.data() || {};
    if (String(order.status || '').toLowerCase() === 'rejected') {
      throw Object.assign(new Error('No se puede emitir un recibo para un pedido rechazado'), { statusCode: 409 });
    }

    const config = configSnapshot.exists ? configSnapshot.data() : {};
    const series = safeText(config.series, 'B001').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 10) || 'B001';
    const existing = order.billing || {};

    if (existing.number && existing.series && existing.publicToken) {
      return {
        order,
        billingConfig: config,
        series: existing.series,
        number: Number(existing.number),
        publicToken: existing.publicToken,
        reused: true
      };
    }

    const number = existing.number
      ? Number(existing.number)
      : Math.max(1, Math.trunc(Number(config.nextNumber || 1)));
    const publicToken = existing.publicToken || createPublicToken();
    const issuedAt = existing.issuedAt || getAdmin().firestore.FieldValue.serverTimestamp();

    if (!existing.number) {
      transaction.set(configRef, {
        nextNumber: number + 1,
        series,
        updatedAt: getAdmin().firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }

    transaction.update(orderRef, {
      billing: {
        ...existing,
        series: existing.series || series,
        number,
        publicToken,
        public: true,
        issuedAt,
        updatedAt: getAdmin().firestore.FieldValue.serverTimestamp()
      }
    });

    return {
      order,
      billingConfig: config,
      series: existing.series || series,
      number,
      publicToken,
      reused: false
    };
  });
}

async function readPublicReceipt(db, orderId, token) {
  const snapshot = await db.collection('orders').doc(orderId).get();
  if (!snapshot.exists) {
    throw Object.assign(new Error('Recibo no encontrado'), { statusCode: 404 });
  }
  const order = snapshot.data() || {};
  const billing = order.billing || {};
  const expected = Buffer.from(String(billing.publicToken || ''));
  const received = Buffer.from(String(token || ''));
  const valid = expected.length > 0
    && expected.length === received.length
    && crypto.timingSafeEqual(expected, received)
    && billing.public === true;
  if (!valid) {
    throw Object.assign(new Error('Enlace de recibo inválido o vencido'), { statusCode: 403 });
  }
  return {
    order,
    series: safeText(billing.series, 'B001'),
    number: Number(billing.number || 0),
    publicToken: billing.publicToken
  };
}

async function fetchLogo(url) {
  if (!/^https:\/\//i.test(String(url || ''))) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || '';
    if (!/^image\/(png|jpeg|jpg)$/i.test(contentType)) return null;
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > 2 * 1024 * 1024) return null;
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function drawCellText(doc, text, x, y, width, options = {}) {
  doc.text(safeText(text, ''), x, y, { width, ellipsis: true, ...options });
}

function drawItemsHeader(doc, y, accent) {
  doc.rect(36, y, 523, 24).fill(accent);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
  drawCellText(doc, 'Cant.', 42, y + 8, 38, { align: 'center' });
  drawCellText(doc, 'Unidad', 82, y + 8, 48, { align: 'center' });
  drawCellText(doc, 'Descripción', 134, y + 8, 235);
  drawCellText(doc, 'P. Unit.', 373, y + 8, 70, { align: 'right' });
  drawCellText(doc, 'Total', 451, y + 8, 100, { align: 'right' });
  return y + 30;
}

function ensurePage(doc, y, needed, accent) {
  if (y + needed < 690) return y;
  doc.addPage();
  return drawItemsHeader(doc, 44, accent);
}

function paymentLabel(value) {
  return PAYMENT_LABELS[value] || safeText(value, 'No indicado');
}

function drawPdf({ order, billingConfig, theme, series, number, qrBuffer, logoBuffer, publicUrl }) {
  return new Promise((resolve, reject) => {
    const documentNumber = formatNumber(series, number);
    const accent = /^#[0-9a-f]{6}$/i.test(String(theme.accentColor || ''))
      ? theme.accentColor
      : '#f97316';
    const businessName = safeText(billingConfig.businessName || theme.storeName, 'Kiosco');
    const doc = new PDFDocument({
      size: 'A4',
      margin: 36,
      bufferPages: true,
      info: {
        Title: `Recibo ${documentNumber}`,
        Author: businessName,
        Subject: 'Representación impresa de comprobante de venta'
      }
    });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const issuedAt = asDate(order.billing?.issuedAt) || asDate(order.createdAt) || new Date();
    const total = Number(order.total || 0);
    const includesIgv = billingConfig.includesIgv !== false;
    const subtotal = includesIgv ? total / 1.18 : total;
    const igv = includesIgv ? total - subtotal : 0;

    if (logoBuffer) {
      try {
        doc.image(logoBuffer, 38, 32, { fit: [72, 72], align: 'center', valign: 'center' });
      } catch {
        doc.roundedRect(38, 32, 68, 68, 10).fill(accent);
      }
    } else {
      doc.roundedRect(38, 32, 68, 68, 10).fill(accent);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22)
        .text(businessName.slice(0, 2).toUpperCase(), 38, 54, { width: 68, align: 'center' });
    }

    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(16)
      .text(businessName, 122, 34, { width: 290 });
    doc.font('Helvetica').fontSize(8.5).fillColor('#374151')
      .text(safeText(billingConfig.address, 'Dirección por configurar'), 122, 58, { width: 290 })
      .text(`Teléfono: ${safeText(billingConfig.phone)}`, 122, 73, { width: 290 })
      .text(`Correo: ${safeText(billingConfig.email)}`, 122, 88, { width: 290 });

    doc.roundedRect(420, 31, 139, 79, 10).lineWidth(1.3).strokeColor('#111827').stroke();
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(9)
      .text(`RUC ${safeText(billingConfig.ruc, 'POR CONFIGURAR')}`, 428, 43, { width: 123, align: 'center' })
      .text(safeText(billingConfig.documentTitle, 'RECIBO DE VENTA'), 428, 64, { width: 123, align: 'center' })
      .fontSize(11).text(documentNumber, 428, 86, { width: 123, align: 'center' });

    doc.moveTo(36, 124).lineTo(559, 124).strokeColor('#d1d5db').stroke();
    const metadata = [
      ['Fecha de emisión', issuedAt.toLocaleDateString('es-PE', { timeZone: 'America/Lima' })],
      ['Cliente', safeText(order.customer, 'Cliente')],
      ['Teléfono', safeText(order.customerPhone)],
      ['Dirección', safeText(order.deliveryAddress, order.deliveryType === 'pickup' ? 'Recojo en tienda' : '-')],
      ['Método de pago', paymentLabel(order.paymentMethod)]
    ];
    let metaY = 138;
    doc.fontSize(8.5);
    for (const [label, value] of metadata) {
      doc.font('Helvetica-Bold').fillColor('#111827').text(`${label}:`, 38, metaY, { width: 95 });
      doc.font('Helvetica').fillColor('#374151').text(value, 135, metaY, { width: 416 });
      metaY += 15;
    }

    let y = drawItemsHeader(doc, metaY + 8, accent);
    doc.font('Helvetica').fontSize(8).fillColor('#111827');
    for (const item of order.items || []) {
      y = ensurePage(doc, y, 30, accent);
      const quantity = Number(item.qty || 0);
      const unitPrice = Number(item.price || 0);
      const lineTotal = Number(item.subtotal ?? quantity * unitPrice);
      const rowHeight = Math.max(24, doc.heightOfString(safeText(item.name, 'Producto'), { width: 235 }) + 12);
      if (Math.floor(y / 24) % 2 === 0) doc.rect(36, y - 4, 523, rowHeight).fill('#f8fafc');
      doc.fillColor('#111827').font('Helvetica').fontSize(8);
      drawCellText(doc, quantity, 42, y + 4, 38, { align: 'center' });
      drawCellText(doc, item.unit || 'UND', 82, y + 4, 48, { align: 'center' });
      drawCellText(doc, item.name || 'Producto', 134, y + 4, 235);
      drawCellText(doc, money(unitPrice), 373, y + 4, 70, { align: 'right' });
      drawCellText(doc, money(lineTotal), 451, y + 4, 100, { align: 'right' });
      y += rowHeight;
    }

    y = ensurePage(doc, y, 120, accent) + 8;
    doc.moveTo(350, y).lineTo(559, y).strokeColor('#cbd5e1').stroke();
    y += 10;
    doc.font('Helvetica').fontSize(9).fillColor('#374151')
      .text('Op. Gravadas:', 355, y, { width: 100 })
      .text(money(subtotal), 455, y, { width: 96, align: 'right' });
    y += 18;
    doc.text('IGV (18%):', 355, y, { width: 100 })
      .text(money(igv), 455, y, { width: 96, align: 'right' });
    y += 20;
    doc.font('Helvetica-Bold').fontSize(12).fillColor(accent)
      .text('TOTAL A PAGAR:', 340, y, { width: 115 })
      .text(money(total), 455, y, { width: 96, align: 'right' });

    const footerY = Math.max(y + 55, 610);
    doc.image(qrBuffer, 40, footerY, { fit: [95, 95] });
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(8.5)
      .text('Condición de pago: Contado', 150, footerY + 2, { width: 260 })
      .text(`Pago: ${paymentLabel(order.paymentMethod)} - ${money(total)}`, 150, footerY + 20, { width: 260 });
    doc.font('Helvetica').fontSize(7.5).fillColor('#4b5563')
      .text(`Pedido: ${safeText(order.id)}`, 150, footerY + 44, { width: 300 })
      .text(publicUrl, 150, footerY + 60, { width: 390, link: publicUrl, underline: true });

    const range = doc.bufferedPageRange();
    for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex += 1) {
      doc.switchToPage(pageIndex);
      doc.font('Helvetica').fontSize(7).fillColor('#6b7280')
        .text(
          'Representación impresa informativa. No sustituye la emisión electrónica tributaria autorizada por SUNAT.',
          36,
          doc.page.height - 34,
          { width: 523, align: 'center' }
        );
    }

    doc.end();
  });
}

async function buildReceipt(req, db, receiptData, orderId) {
  const config = await loadConfiguration(db);
  const order = { id: orderId, ...receiptData.order };
  const publicUrl = publicReceiptUrl(req, orderId, receiptData.publicToken);
  const qrBuffer = await QRCode.toBuffer(publicUrl, { type: 'png', width: 260, margin: 1 });
  const logoBuffer = await fetchLogo(config.theme.storeLogoUrl);
  const pdf = await drawPdf({
    order,
    billingConfig: { ...config.billing, ...(receiptData.billingConfig || {}) },
    theme: config.theme,
    series: receiptData.series,
    number: receiptData.number,
    qrBuffer,
    logoBuffer,
    publicUrl
  });
  return { pdf, publicUrl, documentNumber: formatNumber(receiptData.series, receiptData.number) };
}

function sendPdf(res, result, token) {
  res.status(200);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="recibo-${result.documentNumber}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Receipt-Url', result.publicUrl);
  if (token) res.setHeader('X-Receipt-Token', token);
  res.setHeader('Content-Length', String(result.pdf.length));
  res.end(result.pdf);
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res, 'GET,POST,OPTIONS')) return;

  try {
    const db = getDb();

    if (req.method === 'GET') {
      const orderId = String(req.query?.orderId || '');
      const token = String(req.query?.token || '');
      if (!validOrderId(orderId) || token.length < 20 || token.length > 200) {
        return json(res, 400, { error: 'Parámetros de recibo inválidos' });
      }
      const receiptData = await readPublicReceipt(db, orderId, token);
      const result = await buildReceipt(req, db, receiptData, orderId);
      return sendPdf(res, result, null);
    }

    if (req.method === 'POST') {
      await requireAdmin(req);
      const { orderId } = await readJson(req);
      if (!validOrderId(orderId)) {
        return json(res, 400, { error: 'Se requiere un orderId válido' });
      }
      const receiptData = await reserveReceipt(db, String(orderId));
      const result = await buildReceipt(req, db, receiptData, String(orderId));
      return sendPdf(res, result, receiptData.publicToken);
    }

    res.setHeader('Allow', 'GET,POST,OPTIONS');
    return json(res, 405, { error: `Método ${req.method} no permitido` });
  } catch (error) {
    return json(res, error.statusCode || 500, { error: safeError(error) });
  }
};
