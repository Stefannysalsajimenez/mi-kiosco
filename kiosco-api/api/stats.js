'use strict';

const { getDb } = require('./_lib/firebaseAdmin');
const { requireAdmin } = require('./_lib/auth');
const { applyCors, json, requireMethod, safeError } = require('./_lib/http');
const { asDate } = require('./_lib/orders');

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const LIMA_OFFSET_MS = 5 * HOUR_MS;

function startOfLimaDay(date) {
  const shifted = new Date(date.getTime() - LIMA_OFFSET_MS);
  const utc = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  return new Date(utc + LIMA_OFFSET_MS);
}

function ranges(period) {
  const now = new Date();
  const dayStart = startOfLimaDay(now);
  let currentStart;

  if (period === 'week') {
    const shifted = new Date(dayStart.getTime() - LIMA_OFFSET_MS);
    const weekday = shifted.getUTCDay() || 7;
    currentStart = new Date(dayStart.getTime() - (weekday - 1) * DAY_MS);
  } else if (period === 'month') {
    const shifted = new Date(now.getTime() - LIMA_OFFSET_MS);
    currentStart = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1) + LIMA_OFFSET_MS);
  } else {
    currentStart = dayStart;
  }

  let previousStart;
  if (period === 'month') {
    const shifted = new Date(currentStart.getTime() - LIMA_OFFSET_MS);
    previousStart = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() - 1, 1) + LIMA_OFFSET_MS);
  } else {
    const duration = period === 'week' ? 7 * DAY_MS : DAY_MS;
    previousStart = new Date(currentStart.getTime() - duration);
  }

  return { previousStart, currentStart, currentEnd: now };
}

function isSale(order) {
  return !['rejected', 'cancelled'].includes(String(order.status || '').toLowerCase());
}

function analyze(orders) {
  const productCounts = new Map();
  const customerCounts = new Map();
  const hourlyCounts = new Map();
  const paymentCounts = new Map();
  let revenue = 0;

  orders.forEach(order => {
    if (isSale(order)) revenue += Number(order.total || 0);
    const customer = String(order.customer || 'Sin nombre').trim() || 'Sin nombre';
    customerCounts.set(customer, (customerCounts.get(customer) || 0) + 1);

    const date = asDate(order.createdAt);
    if (date) {
      const limaHour = new Date(date.getTime() - LIMA_OFFSET_MS).getUTCHours();
      hourlyCounts.set(limaHour, (hourlyCounts.get(limaHour) || 0) + 1);
    }

    const method = String(order.paymentMethod || 'No indicado');
    paymentCounts.set(method, (paymentCounts.get(method) || 0) + 1);

    (order.items || []).forEach(item => {
      const name = String(item.name || 'Producto');
      productCounts.set(name, (productCounts.get(name) || 0) + Number(item.qty || 0));
    });
  });

  const sortedProducts = [...productCounts.entries()].sort((a, b) => b[1] - a[1]);
  const topCustomer = [...customerCounts.entries()].sort((a, b) => b[1] - a[1])[0] || null;
  const peakHour = [...hourlyCounts.entries()].sort((a, b) => b[1] - a[1])[0] || null;

  return {
    revenue: Number(revenue.toFixed(2)),
    orderCount: orders.length,
    bestProduct: sortedProducts[0] ? { name: sortedProducts[0][0], units: sortedProducts[0][1] } : null,
    peakHour: peakHour ? { hour: peakHour[0], orders: peakHour[1] } : null,
    topCustomer: topCustomer ? { name: topCustomer[0], orders: topCustomer[1] } : null,
    paymentDistribution: Object.fromEntries(paymentCounts),
    topProducts: sortedProducts.slice(0, 5).map(([name, units]) => ({ name, units }))
  };
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res, 'GET,OPTIONS')) return;
  if (!requireMethod(req, res, 'GET')) return;

  try {
    await requireAdmin(req);
    const period = ['day', 'week', 'month'].includes(req.query?.period) ? req.query.period : 'day';
    const { previousStart, currentStart, currentEnd } = ranges(period);

    const snapshot = await getDb().collection('orders')
      .where('createdAt', '>=', previousStart)
      .where('createdAt', '<=', currentEnd)
      .get();

    const all = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const current = all.filter(order => {
      const date = asDate(order.createdAt);
      return date && date >= currentStart && date <= currentEnd;
    });
    const previous = all.filter(order => {
      const date = asDate(order.createdAt);
      return date && date >= previousStart && date < currentStart;
    });

    const currentStats = analyze(current);
    const previousStats = analyze(previous);
    const changePercent = previousStats.revenue === 0
      ? (currentStats.revenue > 0 ? 100 : 0)
      : ((currentStats.revenue - previousStats.revenue) / previousStats.revenue) * 100;

    return json(res, 200, {
      ok: true,
      period,
      range: {
        previousStart: previousStart.toISOString(),
        currentStart: currentStart.toISOString(),
        currentEnd: currentEnd.toISOString()
      },
      current: currentStats,
      previous: previousStats,
      revenueChangePercent: Number(changePercent.toFixed(2))
    });
  } catch (error) {
    return json(res, error.statusCode || 500, { error: safeError(error) });
  }
};
