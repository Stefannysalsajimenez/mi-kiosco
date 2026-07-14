// js/dashboard.js — Dashboard with Chart.js, real Firebase data, Excel export
const Dashboard = (() => {
  let salesChart = null, ordersChart = null, period = 'day';

  function init() {
    bindPeriodTabs();
    bindDownloads();
    loadStats();
  }

  function bindPeriodTabs() {
    document.querySelectorAll('[data-dash-period]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-dash-period]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        period = btn.dataset.dashPeriod;
        loadStats();
      });
    });
  }

  function bindDownloads() {
    ['Day', 'Week', 'Month'].forEach(p => {
      document.getElementById('dl' + p)?.addEventListener('click', () => dlExcel(p.toLowerCase()));
    });
  }

  function getStart(p) {
    const d = new Date();
    if (p === 'day') { d.setHours(0, 0, 0, 0); return d; }
    if (p === 'week') { d.setDate(d.getDate() - (d.getDay() || 7) + 1); d.setHours(0, 0, 0, 0); return d; }
    d.setDate(1); d.setHours(0, 0, 0, 0); return d;
  }

  function filterByPeriod(orders, p) {
    const start = getStart(p);
    return orders.filter(o => {
      const t = o.createdAt?.toDate?.() || new Date(o.createdAt || 0);
      return t >= start;
    });
  }

  async function loadStats() {
    try {
      const snap = await db.collection(COLL.orders).get();
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const list = filterByPeriod(all, period);

      const revenue = list.filter(o => o.status !== 'rejected').reduce((s, o) => s + (o.total || 0), 0);
      const total = list.length;
      const done = list.filter(o => o.status === 'done').length;
      const pending = list.filter(o => o.status === 'pending').length;
      const rejected = list.filter(o => o.status === 'rejected').length;

      setText('dashRevenue', `${APP_CONFIG.currency} ${revenue.toFixed(2)}`);
      setText('dashOrders', total);
      setText('dashDone', done);
      setText('dashPending', pending);
      setText('dashRejected', rejected);

      // Low stock
      const prodsSnap = await db.collection(COLL.products).get();
      const prods = prodsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const lowStock = prods.filter(p => p.stock != null && p.stock <= 5 && p.active);
      setText('dashLowStock', lowStock.length);
      renderLowStock(lowStock);

      await renderCharts(list, period);
    } catch (e) { console.warn('Dashboard:', e.message); }
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function renderLowStock(prods) {
    const el = document.getElementById('lowStockList');
    if (!el) return;
    if (!prods.length) { el.innerHTML = '<li class="list-group-item text-muted small">Sin stock bajo</li>'; return; }
    el.innerHTML = prods.map(p => `<li class="list-group-item d-flex justify-content-between align-items-center small">
      <span><i class="bi bi-box-seam me-2 text-warning"></i>${p.name}</span>
      <span class="badge bg-danger rounded-pill">${p.stock}</span>
    </li>`).join('');
  }

  async function renderCharts(orders, p) {
    if (!window.Chart) {
      await loadScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js');
    }
    const { labels, salesData, ordersData } = buildChartData(orders, p);
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--bs-primary').trim() || '#f97316';

    const salesCanvas = document.getElementById('salesChart');
    if (salesCanvas) {
      if (salesChart) salesChart.destroy();
      salesChart = new Chart(salesCanvas, {
        type: 'bar',
        data: { labels, datasets: [{ label: `Ventas (${APP_CONFIG.currency})`, data: salesData, backgroundColor: '#f9731688', borderColor: '#f97316', borderWidth: 2, borderRadius: 4 }] },
        options: {
          responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
          scales: { x: { ticks: { color: '#9898b0' }, grid: { color: '#ffffff11' } }, y: { ticks: { color: '#9898b0', callback: v => `${APP_CONFIG.currency}${v}` }, grid: { color: '#ffffff11' }, beginAtZero: true } }
        }
      });
    }

    const ordersCanvas = document.getElementById('ordersChart');
    if (ordersCanvas) {
      if (ordersChart) ordersChart.destroy();
      ordersChart = new Chart(ordersCanvas, {
        type: 'line',
        data: { labels, datasets: [{ label: 'Pedidos', data: ordersData, borderColor: '#06b6d4', backgroundColor: '#06b6d422', borderWidth: 2, pointRadius: 4, fill: true, tension: 0.3 }] },
        options: {
          responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
          scales: { x: { ticks: { color: '#9898b0' }, grid: { color: '#ffffff11' } }, y: { ticks: { color: '#9898b0', stepSize: 1 }, grid: { color: '#ffffff11' }, beginAtZero: true } }
        }
      });
    }
  }

  function buildChartData(orders, p) {
    const now = new Date();
    let labels = [], salesMap = {}, ordersMap = {};

    if (p === 'day') {
      for (let h = 0; h < 24; h++) { const l = `${String(h).padStart(2, '0')}h`; labels.push(l); salesMap[l] = 0; ordersMap[l] = 0; }
      orders.forEach(o => {
        const t = o.createdAt?.toDate?.() || new Date(0);
        const k = `${String(t.getHours()).padStart(2, '0')}h`;
        if (salesMap[k] !== undefined && o.status !== 'rejected') { salesMap[k] += o.total || 0; ordersMap[k]++; }
      });
    } else if (p === 'week') {
      const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
      for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(now.getDate() - i); const l = days[(d.getDay() + 6) % 7]; labels.push(l); salesMap[l] = 0; ordersMap[l] = 0; }
      orders.forEach(o => {
        const t = o.createdAt?.toDate?.() || new Date(0);
        const l = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'][(t.getDay() + 6) % 7];
        if (salesMap[l] !== undefined && o.status !== 'rejected') { salesMap[l] += o.total || 0; ordersMap[l]++; }
      });
    } else {
      const dm = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      for (let d = 1; d <= dm; d++) { const l = `${d}`; labels.push(l); salesMap[l] = 0; ordersMap[l] = 0; }
      orders.forEach(o => {
        const t = o.createdAt?.toDate?.() || new Date(0);
        const l = `${t.getDate()}`;
        if (salesMap[l] !== undefined && o.status !== 'rejected') { salesMap[l] += o.total || 0; ordersMap[l]++; }
      });
    }
    return { labels, salesData: labels.map(l => +(salesMap[l] || 0).toFixed(2)), ordersData: labels.map(l => ordersMap[l] || 0) };
  }

  async function dlExcel(p) {
    if (!window.XLSX) await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
    showToast('Generando Excel…', 'info');
    try {
      const snap = await db.collection(COLL.orders).get();
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const list = filterByPeriod(all, p);
      const pNames = { day: 'Hoy', week: 'Semana', month: 'Mes' };
      const statusLb = { pending: 'Pendiente', done: 'Completado', rejected: 'Rechazado' };
      const headers = ['ID', 'Cliente', 'Teléfono', 'Productos', 'Total', 'Estado', 'Fecha'];
      const rows = list.map(o => [
        o.id.slice(-8), o.customer || '', o.customerPhone || '',
        (o.items || []).map(i => `${i.name} x${i.qty}`).join(' | '),
        o.total || 0, statusLb[o.status] || o.status,
        o.createdAt?.toDate ? o.createdAt.toDate().toLocaleString('es-PE') : ''
      ]);
      const revenue = list.filter(o => o.status !== 'rejected').reduce((s, o) => s + (o.total || 0), 0);
      const summary = [['Período', pNames[p] || p], ['Pedidos', list.length], ['Ingresos', revenue.toFixed(2)], ['Completados', list.filter(o => o.status === 'done').length]];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), 'Pedidos');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Resumen');
      XLSX.writeFile(wb, `kiosco-${p}-${new Date().toISOString().slice(0, 10)}.xlsx`);
      showToast('Excel descargado ✓', 'success');
    } catch (e) { showToast('Error: ' + e.message, 'danger'); }
  }

  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  }

  return { init };
})();
