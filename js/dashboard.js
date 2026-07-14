'use strict';

const Dashboard = (() => {
  let salesChart = null;
  let ordersChart = null;
  let period = 'day';
  let orders = [];
  let products = [];
  let unsubscribeOrders = null;
  let unsubscribeProducts = null;
  let initialized = false;
  let refreshTimer = null;
  let chartScriptPromise = null;
  let excelScriptPromise = null;
  const exportLocks = new Set();

  function init() {
    if (initialized) {
      refresh();
      return;
    }

    initialized = true;
    bindPeriodTabs();
    bindDownloads();
    bindThemeRefresh();
    subscribeRealtimeData();
    refreshTimer = window.setInterval(refresh, 60000);
  }

  function refresh() {
    renderStats();
  }

  function bindPeriodTabs() {
    document.querySelectorAll('[data-dash-period]').forEach(button => {
      if (button.dataset.dashboardBound === 'true') return;
      button.dataset.dashboardBound = 'true';
      button.addEventListener('click', () => {
        document.querySelectorAll('[data-dash-period]').forEach(item => item.classList.remove('active'));
        button.classList.add('active');
        period = button.dataset.dashPeriod || 'day';
        renderStats();
      });
    });
  }

  function bindDownloads() {
    const buttons = {
      dlDay: 'day',
      dlWeek: 'week',
      dlMonth: 'month'
    };

    Object.entries(buttons).forEach(([id, selectedPeriod]) => {
      const button = document.getElementById(id);
      if (!button || button.dataset.exportBound === 'true') return;
      button.dataset.exportBound = 'true';
      button.addEventListener('click', () => {
        const list = filterByPeriod(orders, selectedPeriod);
        exportOrders(list, {
          period: selectedPeriod,
          button,
          filePrefix: 'kiosco'
        });
      });
    });
  }

  function bindThemeRefresh() {
    if (window.__dashboardThemeBound) return;
    window.__dashboardThemeBound = true;
    window.addEventListener('kiosco:themechange', () => renderCharts(filterByPeriod(orders, period), period));
  }

  function subscribeRealtimeData() {
    if (typeof unsubscribeOrders === 'function') unsubscribeOrders();
    if (typeof unsubscribeProducts === 'function') unsubscribeProducts();

    unsubscribeOrders = db.collection(COLL.orders).onSnapshot(snapshot => {
      orders = snapshot.docs.map(documentSnapshot => ({
        id: documentSnapshot.id,
        ...documentSnapshot.data()
      }));
      renderStats();
    }, error => {
      console.warn('Dashboard pedidos:', error?.code || error);
      showToast('No se pudieron actualizar los pedidos del dashboard', 'warning');
    });

    unsubscribeProducts = db.collection(COLL.products).onSnapshot(snapshot => {
      products = snapshot.docs.map(documentSnapshot => ({
        id: documentSnapshot.id,
        ...documentSnapshot.data()
      }));
      renderLowStockStats();
    }, error => {
      console.warn('Dashboard productos:', error?.code || error);
    });
  }

  function toDate(value) {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function getPeriodRange(selectedPeriod, baseDate = new Date()) {
    const start = new Date(baseDate);
    const end = new Date(baseDate);

    if (selectedPeriod === 'day') {
      start.setHours(0, 0, 0, 0);
      end.setTime(start.getTime());
      end.setDate(end.getDate() + 1);
      return { start, end };
    }

    if (selectedPeriod === 'week') {
      const day = start.getDay();
      const daysFromMonday = day === 0 ? 6 : day - 1;
      start.setDate(start.getDate() - daysFromMonday);
      start.setHours(0, 0, 0, 0);
      end.setTime(start.getTime());
      end.setDate(end.getDate() + 7);
      return { start, end };
    }

    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setTime(start.getTime());
    end.setMonth(end.getMonth() + 1);
    return { start, end };
  }

  function filterByPeriod(list, selectedPeriod) {
    const { start, end } = getPeriodRange(selectedPeriod);
    return list.filter(order => {
      const createdAt = toDate(order.createdAt);
      return createdAt && createdAt >= start && createdAt < end;
    });
  }

  function renderStats() {
    const list = filterByPeriod(orders, period);
    const revenue = list
      .filter(order => order.status !== 'rejected')
      .reduce((sum, order) => sum + Number(order.total || 0), 0);

    setText('dashRevenue', `${getCurrency()} ${revenue.toFixed(2)}`);
    setText('dashOrders', list.length);
    setText('dashDone', list.filter(order => order.status === 'done').length);
    setText('dashPending', list.filter(order => order.status === 'pending').length);
    setText('dashRejected', list.filter(order => order.status === 'rejected').length);

    renderLowStockStats();
    renderCharts(list, period);
  }

  function renderLowStockStats() {
    const lowStock = products.filter(product => {
      const stock = Number(product.stock);
      return product.active !== false && Number.isFinite(stock) && stock <= 5;
    });

    setText('dashLowStock', lowStock.length);
    renderLowStock(lowStock);
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
  }

  function getCurrency() {
    return window.APP_CONFIG?.currency || 'S/';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderLowStock(list) {
    const element = document.getElementById('lowStockList');
    if (!element) return;

    if (!list.length) {
      element.innerHTML = '<li class="list-group-item text-muted small">Sin stock bajo</li>';
      return;
    }

    element.innerHTML = list.map(product => `
      <li class="list-group-item d-flex justify-content-between align-items-center small">
        <span><i class="bi bi-box-seam me-2 text-warning"></i>${escapeHtml(product.name)}</span>
        <span class="badge bg-danger rounded-pill">${Number(product.stock)}</span>
      </li>`).join('');
  }

  async function ensureChartLibrary() {
    if (window.Chart) return;
    if (!chartScriptPromise) {
      chartScriptPromise = loadScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js');
    }
    await chartScriptPromise;
  }

  async function renderCharts(list, selectedPeriod) {
    try {
      await ensureChartLibrary();
    } catch (error) {
      console.warn('No se pudo cargar Chart.js:', error);
      return;
    }

    const { labels, salesData, ordersData } = buildChartData(list, selectedPeriod);
    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--app-muted').trim() || '#6c757d';
    const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--app-border').trim() || '#dee2e6';

    const salesCanvas = document.getElementById('salesChart');
    if (salesCanvas) {
      salesChart?.destroy();
      salesChart = new Chart(salesCanvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: `Ventas (${getCurrency()})`,
            data: salesData,
            backgroundColor: '#f9731688',
            borderColor: '#f97316',
            borderWidth: 2,
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: textColor }, grid: { color: gridColor } },
            y: {
              ticks: { color: textColor, callback: value => `${getCurrency()}${value}` },
              grid: { color: gridColor },
              beginAtZero: true
            }
          }
        }
      });
    }

    const ordersCanvas = document.getElementById('ordersChart');
    if (ordersCanvas) {
      ordersChart?.destroy();
      ordersChart = new Chart(ordersCanvas, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Pedidos',
            data: ordersData,
            borderColor: '#06b6d4',
            backgroundColor: '#06b6d422',
            borderWidth: 2,
            pointRadius: 4,
            fill: true,
            tension: 0.3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: textColor }, grid: { color: gridColor } },
            y: { ticks: { color: textColor, stepSize: 1 }, grid: { color: gridColor }, beginAtZero: true }
          }
        }
      });
    }
  }

  function buildChartData(list, selectedPeriod) {
    const { start, end } = getPeriodRange(selectedPeriod);
    const labels = [];
    const salesMap = new Map();
    const ordersMap = new Map();

    if (selectedPeriod === 'day') {
      for (let hour = 0; hour < 24; hour += 1) {
        const label = `${String(hour).padStart(2, '0')}h`;
        labels.push(label);
        salesMap.set(label, 0);
        ordersMap.set(label, 0);
      }
    } else if (selectedPeriod === 'week') {
      const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
      dayNames.forEach(label => {
        labels.push(label);
        salesMap.set(label, 0);
        ordersMap.set(label, 0);
      });
    } else {
      const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
      for (let day = 1; day <= daysInMonth; day += 1) {
        const label = String(day);
        labels.push(label);
        salesMap.set(label, 0);
        ordersMap.set(label, 0);
      }
    }

    list.forEach(order => {
      const createdAt = toDate(order.createdAt);
      if (!createdAt || createdAt < start || createdAt >= end) return;

      let key;
      if (selectedPeriod === 'day') {
        key = `${String(createdAt.getHours()).padStart(2, '0')}h`;
      } else if (selectedPeriod === 'week') {
        key = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][createdAt.getDay()];
      } else {
        key = String(createdAt.getDate());
      }

      if (!salesMap.has(key)) return;
      if (order.status !== 'rejected') {
        salesMap.set(key, salesMap.get(key) + Number(order.total || 0));
      }
      ordersMap.set(key, ordersMap.get(key) + 1);
    });

    return {
      labels,
      salesData: labels.map(label => Number(salesMap.get(label).toFixed(2))),
      ordersData: labels.map(label => ordersMap.get(label))
    };
  }

  async function ensureExcelLibrary() {
    if (window.XLSX) return;
    if (!excelScriptPromise) {
      excelScriptPromise = loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
    }
    await excelScriptPromise;
  }

  function formatPeriodName(selectedPeriod) {
    return { day: 'Hoy', week: 'Semana', month: 'Mes' }[selectedPeriod] || 'Historial';
  }

  async function exportOrders(list, options = {}) {
    const selectedPeriod = options.period || 'day';
    const lockKey = options.lockKey || `${selectedPeriod}:${options.filePrefix || 'kiosco'}`;
    const button = options.button || null;

    if (exportLocks.has(lockKey)) return false;
    exportLocks.add(lockKey);

    const originalHtml = button?.innerHTML;
    if (button) {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.innerHTML = '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Exportando';
    }

    try {
      await ensureExcelLibrary();

      const statusLabels = {
        pending: 'Pendiente',
        done: 'Completado',
        rejected: 'Rechazado'
      };

      const headers = [
        'ID', 'Cliente', 'Teléfono', 'Productos', 'Unidad', 'Total', 'Estado',
        'Entrega', 'Dirección', 'Fecha', 'Notas'
      ];

      const rows = list.map(order => {
        const createdAt = toDate(order.createdAt);
        const units = [...new Set((order.items || []).map(item => item.unit || 'Unidad'))].join(' | ');
        return [
          order.id,
          order.customer || '',
          order.customerPhone || '',
          (order.items || []).map(item => `${item.name} x${item.qty}`).join(' | '),
          units,
          Number(order.total || 0),
          statusLabels[order.status] || order.status || '',
          order.deliveryType === 'delivery' ? 'Delivery' : 'Recojo en tienda',
          order.deliveryAddress || '',
          createdAt ? createdAt.toLocaleString('es-PE') : '',
          order.notes || ''
        ];
      });

      const revenue = list
        .filter(order => order.status !== 'rejected')
        .reduce((sum, order) => sum + Number(order.total || 0), 0);

      const summary = [
        ['Período', options.periodLabel || formatPeriodName(selectedPeriod)],
        ['Pedidos', list.length],
        ['Ingresos', Number(revenue.toFixed(2))],
        ['Pendientes', list.filter(order => order.status === 'pending').length],
        ['Completados', list.filter(order => order.status === 'done').length],
        ['Rechazados', list.filter(order => order.status === 'rejected').length]
      ];

      const workbook = XLSX.utils.book_new();
      const ordersSheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ordersSheet['!cols'] = [
        { wch: 24 }, { wch: 22 }, { wch: 14 }, { wch: 48 }, { wch: 18 },
        { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 34 }, { wch: 22 }, { wch: 36 }
      ];
      XLSX.utils.book_append_sheet(workbook, ordersSheet, 'Pedidos');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summary), 'Resumen');

      const date = new Date().toISOString().slice(0, 10);
      const prefix = String(options.filePrefix || 'kiosco').replace(/[^a-z0-9_-]/gi, '-');
      XLSX.writeFile(workbook, `${prefix}-${selectedPeriod}-${date}.xlsx`, { compression: true });
      showToast('Excel descargado', 'success');
      return true;
    } catch (error) {
      console.error('Exportación Excel:', error);
      showToast(`No se pudo exportar el Excel: ${error.message}`, 'danger');
      return false;
    } finally {
      exportLocks.delete(lockKey);
      if (button) {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        button.innerHTML = originalHtml;
      }
    }
  }

  function loadScript(source) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${source}"]`);
      if (existing) {
        if (existing.dataset.loaded === 'true') {
          resolve();
          return;
        }
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = source;
      script.async = true;
      script.addEventListener('load', () => {
        script.dataset.loaded = 'true';
        resolve();
      }, { once: true });
      script.addEventListener('error', () => reject(new Error(`No se pudo cargar ${source}`)), { once: true });
      document.head.appendChild(script);
    });
  }

  return {
    init,
    refresh,
    getPeriodRange,
    filterByPeriod,
    exportOrders
  };
})();

window.Dashboard = Dashboard;
