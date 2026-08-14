'use strict';

(function initializeKioscoDashboardHeatmap() {
  const VERSION = '1.0.1';
  const CHART_CDN = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';

  if (window.KioscoDashboardHeatmap?.version) return;

  const state = {
    orders: [],
    period: 'day',
    calendarDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    hourlyChart: null,
    heatmapVisible: false,
    tooltips: []
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function toDate(value) {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatMoney(value) {
    const currency = window.APP_CONFIG?.currency || 'S/';
    return `${currency} ${Number(value || 0).toFixed(2)}`;
  }

  function loadChartLibrary() {
    if (window.Chart) return Promise.resolve(window.Chart);
    return new Promise((resolve, reject) => {
      const existing = [...document.scripts].find(script => script.src === CHART_CDN);
      if (existing) {
        existing.addEventListener('load', () => resolve(window.Chart), { once: true });
        existing.addEventListener('error', () => reject(new Error('No se pudo cargar Chart.js')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = CHART_CDN;
      script.async = true;
      script.addEventListener('load', () => resolve(window.Chart), { once: true });
      script.addEventListener('error', () => reject(new Error('No se pudo cargar Chart.js')), { once: true });
      document.head.appendChild(script);
    });
  }

  function mountHeatmap() {
    if (document.getElementById('dashboardHeatmapPane')) return;
    const section = document.getElementById('sec-dashboard');
    if (!section) return;
    const toolbar = section.firstElementChild;
    const periodGroup = toolbar?.querySelector('.btn-group');
    if (!toolbar || !periodGroup) return;

    const mapButton = document.createElement('button');
    mapButton.type = 'button';
    mapButton.className = 'btn btn-outline-secondary btn-sm';
    mapButton.id = 'dashboardHeatmapTab';
    mapButton.innerHTML = '<i class="bi bi-grid-3x3-gap me-1"></i>Mapa de calor';
    periodGroup.appendChild(mapButton);

    const standardView = document.createElement('div');
    standardView.id = 'dashboardStandardView';
    let node = toolbar.nextSibling;
    while (node) {
      const nextNode = node.nextSibling;
      standardView.appendChild(node);
      node = nextNode;
    }
    section.appendChild(standardView);

    const heatmapPane = document.createElement('div');
    heatmapPane.id = 'dashboardHeatmapPane';
    heatmapPane.className = 'd-none';
    heatmapPane.innerHTML = `
      <div class="row g-4">
        <div class="col-xl-7">
          <div class="card h-100">
            <div class="card-header d-flex align-items-center justify-content-between gap-2 flex-wrap">
              <div class="fw-semibold"><i class="bi bi-calendar3 me-2"></i>Calendario mensual de pedidos</div>
              <div class="d-flex align-items-center gap-2">
                <button type="button" class="btn btn-outline-secondary btn-sm" id="heatmapPreviousMonth" aria-label="Mes anterior"><i class="bi bi-chevron-left"></i></button>
                <span class="fw-semibold text-center kiosco-heatmap-month-label" id="heatmapMonthLabel"></span>
                <button type="button" class="btn btn-outline-secondary btn-sm" id="heatmapNextMonth" aria-label="Mes siguiente"><i class="bi bi-chevron-right"></i></button>
              </div>
            </div>
            <div class="card-body">
              <div class="kiosco-heatmap-legend d-flex gap-3 flex-wrap small mb-3">
                <span><i class="kiosco-heat-swatch kiosco-heat-0"></i>Sin pedidos</span>
                <span><i class="kiosco-heat-swatch kiosco-heat-1"></i>1–3</span>
                <span><i class="kiosco-heat-swatch kiosco-heat-2"></i>4–7</span>
                <span><i class="kiosco-heat-swatch kiosco-heat-3"></i>8 o más</span>
              </div>
              <div class="kiosco-heatmap-calendar" id="heatmapCalendar" aria-label="Mapa de calor mensual"></div>
            </div>
          </div>
        </div>
        <div class="col-xl-5">
          <div class="card h-100">
            <div class="card-header">
              <div class="fw-semibold"><i class="bi bi-clock-history me-2"></i>Pedidos por hora</div>
              <div class="small text-body-secondary mt-1" id="heatmapPeriodLabel">Período: Hoy</div>
            </div>
            <div class="card-body kiosco-hourly-chart-wrap"><canvas id="ordersByHourChart"></canvas></div>
          </div>
        </div>
      </div>`;
    section.appendChild(heatmapPane);
  }

  function periodLabel(period) {
    return { day: 'Hoy', week: 'Semana actual', month: 'Mes actual' }[period] || 'Hoy';
  }

  function showHeatmap() {
    state.heatmapVisible = true;
    document.getElementById('dashboardStandardView')?.classList.add('d-none');
    document.getElementById('dashboardHeatmapPane')?.classList.remove('d-none');
    const mapButton = document.getElementById('dashboardHeatmapTab');
    mapButton?.classList.remove('btn-outline-secondary');
    mapButton?.classList.add('btn-primary', 'active');
    document.querySelectorAll('[data-dash-period]').forEach(button => {
      button.classList.remove('btn-primary', 'active');
      button.classList.add('btn-outline-secondary');
    });
    render();
  }

  function showStandardDashboard() {
    state.heatmapVisible = false;
    document.getElementById('dashboardStandardView')?.classList.remove('d-none');
    document.getElementById('dashboardHeatmapPane')?.classList.add('d-none');
    const mapButton = document.getElementById('dashboardHeatmapTab');
    mapButton?.classList.remove('btn-primary', 'active');
    mapButton?.classList.add('btn-outline-secondary');
  }

  function monthOrders() {
    const year = state.calendarDate.getFullYear();
    const month = state.calendarDate.getMonth();
    return state.orders.filter(order => {
      const date = toDate(order.createdAt);
      return date && date.getFullYear() === year && date.getMonth() === month;
    });
  }

  function heatClass(count) {
    if (count === 0) return 'kiosco-heat-0';
    if (count <= 3) return 'kiosco-heat-1';
    if (count <= 7) return 'kiosco-heat-2';
    return 'kiosco-heat-3';
  }

  function disposeTooltips() {
    state.tooltips.forEach(tooltip => tooltip.dispose?.());
    state.tooltips = [];
  }

  function renderCalendar() {
    const calendar = document.getElementById('heatmapCalendar');
    const label = document.getElementById('heatmapMonthLabel');
    if (!calendar || !label) return;
    disposeTooltips();

    const year = state.calendarDate.getFullYear();
    const month = state.calendarDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const offset = (firstDay.getDay() + 6) % 7;
    const orders = monthOrders();
    const byDay = Array.from({ length: daysInMonth }, () => ({ count: 0, revenue: 0 }));
    orders.forEach(order => {
      const date = toDate(order.createdAt);
      if (!date) return;
      const item = byDay[date.getDate() - 1];
      item.count += 1;
      if (order.status !== 'rejected') item.revenue += Number(order.total || 0);
    });

    label.textContent = state.calendarDate.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
    const headers = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
      .map(day => `<div class="kiosco-heatmap-weekday">${day}</div>`).join('');
    const cells = [];
    for (let index = 0; index < offset; index += 1) cells.push('<div class="kiosco-heatmap-day kiosco-heatmap-day-empty" aria-hidden="true"></div>');
    for (let day = 1; day <= daysInMonth; day += 1) {
      const values = byDay[day - 1];
      const tooltip = `${values.count} ${values.count === 1 ? 'pedido' : 'pedidos'} · ${formatMoney(values.revenue)}`;
      cells.push(`<button type="button" class="kiosco-heatmap-day ${heatClass(values.count)}" data-bs-toggle="tooltip" data-bs-placement="top" title="${escapeHtml(tooltip)}" aria-label="Día ${day}: ${escapeHtml(tooltip)}">
        <span class="kiosco-heatmap-day-number">${day}</span>
        <span class="kiosco-heatmap-day-count">${values.count}</span>
      </button>`);
    }
    const totalCells = offset + daysInMonth;
    const trailing = (7 - (totalCells % 7)) % 7;
    for (let index = 0; index < trailing; index += 1) cells.push('<div class="kiosco-heatmap-day kiosco-heatmap-day-empty" aria-hidden="true"></div>');
    calendar.innerHTML = headers + cells.join('');

    if (window.bootstrap?.Tooltip) {
      state.tooltips = [...calendar.querySelectorAll('[data-bs-toggle="tooltip"]')]
        .map(element => new bootstrap.Tooltip(element, { container: 'body' }));
    }
  }

  function getPeriodRange(period, baseDate = new Date()) {
    if (window.Dashboard?.getPeriodRange) return window.Dashboard.getPeriodRange(period, baseDate);
    const start = new Date(baseDate);
    const end = new Date(baseDate);
    if (period === 'day') {
      start.setHours(0, 0, 0, 0);
      end.setTime(start.getTime());
      end.setDate(end.getDate() + 1);
      return { start, end };
    }
    if (period === 'week') {
      const day = start.getDay();
      start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
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

  function ordersForPeriod() {
    const { start, end } = getPeriodRange(state.period);
    return state.orders.filter(order => {
      const date = toDate(order.createdAt);
      return date && date >= start && date < end;
    });
  }

  async function renderHourlyChart() {
    const canvas = document.getElementById('ordersByHourChart');
    const periodElement = document.getElementById('heatmapPeriodLabel');
    if (!canvas) return;
    if (periodElement) periodElement.textContent = `Período: ${periodLabel(state.period)}`;

    try {
      await loadChartLibrary();
    } catch (error) {
      console.warn('Chart.js para mapa de calor:', error);
      return;
    }

    const counts = Array.from({ length: 24 }, () => 0);
    ordersForPeriod().forEach(order => {
      const date = toDate(order.createdAt);
      if (date) counts[date.getHours()] += 1;
    });
    const styles = getComputedStyle(document.documentElement);
    const accent = styles.getPropertyValue('--accent').trim() || '#f97316';
    const textColor = styles.getPropertyValue('--bs-body-color').trim() || '#6c757d';
    const borderColor = styles.getPropertyValue('--bs-border-color').trim() || 'rgba(127,127,127,.2)';

    state.hourlyChart?.destroy();
    state.hourlyChart = new window.Chart(canvas, {
      type: 'bar',
      data: {
        labels: counts.map((_, hour) => `${String(hour).padStart(2, '0')}:00`),
        datasets: [{ label: 'Pedidos', data: counts, backgroundColor: accent, borderRadius: 5, maxBarThickness: 20 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: context => `${context.parsed.y} ${context.parsed.y === 1 ? 'pedido' : 'pedidos'}` } }
        },
        scales: {
          x: { ticks: { color: textColor, maxRotation: 90, minRotation: 45 }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: textColor, precision: 0 }, grid: { color: borderColor } }
        }
      }
    });
  }

  function render() {
    renderCalendar();
    void renderHourlyChart();
  }

  function changeCalendarMonth(delta) {
    state.calendarDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() + delta, 1);
    renderCalendar();
  }

  function bindEvents() {
    document.getElementById('dashboardHeatmapTab')?.addEventListener('click', showHeatmap);
    document.querySelectorAll('[data-dash-period]').forEach(button => {
      button.addEventListener('click', () => {
        state.period = button.dataset.dashPeriod || 'day';
        showStandardDashboard();
      });
    });
    document.getElementById('heatmapPreviousMonth')?.addEventListener('click', () => changeCalendarMonth(-1));
    document.getElementById('heatmapNextMonth')?.addEventListener('click', () => changeCalendarMonth(1));

    window.addEventListener('dashboard:data-updated', event => {
      state.orders = Array.isArray(event.detail?.orders) ? event.detail.orders : state.orders;
      state.period = event.detail?.period || state.period;
      if (state.heatmapVisible) render();
    });
    window.addEventListener('dashboard:period-changed', event => {
      state.period = event.detail?.period || 'day';
      if (state.heatmapVisible) void renderHourlyChart();
    });
    window.addEventListener('kiosco:themechange', () => {
      if (state.heatmapVisible) render();
    });
  }

  function bootstrapData() {
    state.orders = window.Dashboard?.getOrders?.() || [];
    state.period = window.Dashboard?.getPeriod?.() || 'day';
    renderCalendar();
  }

  mountHeatmap();
  bindEvents();
  bootstrapData();

  window.KioscoDashboardHeatmap = Object.freeze({
    version: VERSION,
    show: showHeatmap,
    hide: showStandardDashboard,
    render,
    getOrders: () => state.orders.map(order => ({ ...order }))
  });
})();
