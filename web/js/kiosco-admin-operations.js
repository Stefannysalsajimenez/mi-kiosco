'use strict';

(function initializeKioscoAdminOperations() {
  const VERSION = '1.0.1';
  const EXPENSE_CATEGORIES = ['Mercadería', 'Servicios', 'Transporte', 'Personal', 'Otros'];
  const CHART_CDN = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
  const XLSX_CDN = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
  const JSPDF_CDN = 'https://unpkg.com/jspdf@4.2.1/dist/jspdf.umd.min.js';
  const BATCH_SIZE = 10;

  if (window.KioscoAdminOperations?.version) return;

  const state = {
    expenses: [],
    expenseUnsubscribe: null,
    currentExpenseId: null,
    expenseChart: null,
    dashboardOrders: [],
    dashboardPeriod: 'day',
    adminProducts: [],
    adminCategories: [],
    adminGridObserver: null,
    replenishmentProductId: null,
    importRows: [],
    importFileName: '',
    importInProgress: false,
    exportInProgress: false
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normalizeId(value) {
    return String(value ?? '').trim();
  }

  function normalizeName(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLocaleLowerCase('es');
  }

  function notify(message, type = 'info') {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
      return;
    }
    console.info(`[KioscoAdminOperations:${type}] ${message}`);
  }

  function formatMoney(value) {
    const currency = window.APP_CONFIG?.currency || 'S/';
    const amount = Number(value || 0);
    return `${currency} ${Number.isFinite(amount) ? amount.toFixed(2) : '0.00'}`;
  }

  function toDate(value) {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDate(value) {
    const date = toDate(value);
    return date ? date.toLocaleDateString('es-PE') : '—';
  }

  function localDateInput(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function localMonthInput(date = new Date()) {
    return localDateInput(date).slice(0, 7);
  }

  function parseLocalDate(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function getModal(id) {
    const element = document.getElementById(id);
    if (!element || !window.bootstrap?.Modal) return null;
    return bootstrap.Modal.getOrCreateInstance(element);
  }

  function loadScript(source, globalName) {
    if (globalName && window[globalName]) return Promise.resolve(window[globalName]);
    return new Promise((resolve, reject) => {
      const existing = [...document.scripts].find(script => script.src === source);
      if (existing) {
        if (!globalName || window[globalName]) {
          resolve(globalName ? window[globalName] : true);
          return;
        }
        existing.addEventListener('load', () => resolve(window[globalName]), { once: true });
        existing.addEventListener('error', () => reject(new Error(`No se pudo cargar ${source}`)), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = source;
      script.async = true;
      script.addEventListener('load', () => resolve(globalName ? window[globalName] : true), { once: true });
      script.addEventListener('error', () => reject(new Error(`No se pudo cargar ${source}`)), { once: true });
      document.head.appendChild(script);
    });
  }

  function createExpensesNavigationLink() {
    const link = document.createElement('a');
    link.href = '#';
    link.className = 'nav-link';
    link.dataset.adminSection = 'expenses';
    link.innerHTML = '<i class="bi bi-receipt-cutoff"></i> Gastos';
    return link;
  }

  function mountExpensesNavigation() {
    const sidebar = document.querySelector('.admin-sidebar');
    if (sidebar && !sidebar.querySelector('[data-admin-section="expenses"]')) {
      const link = createExpensesNavigationLink();
      const scheduleLink = sidebar.querySelector('[data-admin-section="horario"]');
      if (scheduleLink) sidebar.insertBefore(link, scheduleLink);
      else sidebar.querySelector('.mt-auto')?.before(link);
    }

    const mobileNavigation = document.getElementById('adminNavMobile');
    if (mobileNavigation && !mobileNavigation.querySelector('[data-admin-section="expenses"]')) {
      const mobileLink = createExpensesNavigationLink();
      const mobileScheduleLink = mobileNavigation.querySelector('[data-admin-section="horario"]');
      if (mobileScheduleLink) mobileNavigation.insertBefore(mobileLink, mobileScheduleLink);
      else mobileNavigation.appendChild(mobileLink);
    }
  }

  function openExpensesSection(event) {
    event?.preventDefault();
    document.querySelectorAll('[data-admin-section]').forEach(element => {
      element.classList.toggle('active', element.dataset.adminSection === 'expenses');
    });
    document.querySelectorAll('.admin-section').forEach(element => {
      element.classList.toggle('active', element.id === 'sec-expenses');
    });
    const offcanvas = document.getElementById('adminOffcanvas');
    if (offcanvas && window.bootstrap?.Offcanvas) {
      window.bootstrap.Offcanvas.getInstance(offcanvas)?.hide();
    }
    subscribeExpenses();
    renderExpenses();
  }

  function expenseCategoryCardsMarkup() {
    return EXPENSE_CATEGORIES.map(category => `
      <div class="col-6 col-md-4 col-xl">
        <div class="card h-100 kiosco-expense-summary-card">
          <div class="card-body py-3">
            <div class="small text-body-secondary">${escapeHtml(category)}</div>
            <div class="fw-bold mt-1" data-expense-category-total="${escapeHtml(category)}">${escapeHtml(formatMoney(0))}</div>
          </div>
        </div>
      </div>`).join('');
  }

  function mountExpensesSection() {
    if (document.getElementById('sec-expenses')) return;
    const content = document.querySelector('.admin-content');
    if (!content) return;

    const section = document.createElement('div');
    section.className = 'admin-section';
    section.id = 'sec-expenses';
    section.innerHTML = `
      <div class="d-flex align-items-start justify-content-between gap-3 flex-wrap mb-4">
        <div>
          <h2 class="section-title mb-1"><i class="bi bi-receipt-cutoff me-2"></i>Gastos</h2>
          <p class="text-body-secondary small mb-0">Control mensual de egresos operativos.</p>
        </div>
        <div class="d-flex gap-2 flex-wrap">
          <input type="month" class="form-control form-control-sm kiosco-month-input" id="expenseMonthFilter" value="${localMonthInput()}" aria-label="Mes de gastos">
          <button type="button" class="btn btn-outline-success btn-sm" id="exportExpensesBtn">
            <i class="bi bi-file-earmark-excel me-1"></i>Exportar Excel
          </button>
          <button type="button" class="btn btn-primary btn-sm" id="addExpenseBtn">
            <i class="bi bi-plus-lg me-1"></i>Nuevo gasto
          </button>
        </div>
      </div>
      <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <h3 class="h6 mb-0">Resumen por categoría</h3>
        <div class="fw-bold">Total del mes: <span class="kiosco-accent-text" id="expensesMonthTotal">${escapeHtml(formatMoney(0))}</span></div>
      </div>
      <div class="row g-3 mb-4 kiosco-expense-summary-row">${expenseCategoryCardsMarkup()}</div>
      <div class="card mb-4">
        <div class="card-header fw-semibold"><i class="bi bi-bar-chart me-2"></i>Gastos por día</div>
        <div class="card-body kiosco-expense-chart-wrap"><canvas id="expensesByDayChart"></canvas></div>
      </div>
      <div class="card">
        <div class="table-responsive">
          <table class="table table-hover align-middle mb-0">
            <thead class="table-dark">
              <tr><th>Fecha</th><th>Descripción</th><th>Categoría</th><th class="text-end">Monto</th><th class="text-end">Acciones</th></tr>
            </thead>
            <tbody id="expensesTableBody">
              <tr><td colspan="5" class="text-center text-body-secondary py-5">Inicia sesión para consultar los gastos.</td></tr>
            </tbody>
          </table>
        </div>
      </div>`;

    const scheduleSection = document.getElementById('sec-horario');
    if (scheduleSection) content.insertBefore(section, scheduleSection);
    else content.appendChild(section);
  }

  function mountProductActions() {
    if (document.getElementById('importProductsExcelBtn')) return;
    const section = document.getElementById('sec-products');
    const header = section?.querySelector(':scope > .d-flex');
    const addButton = document.getElementById('btnAddProduct');
    if (!header || !addButton) return;

    header.classList.add('flex-wrap', 'gap-2');
    const actions = document.createElement('div');
    actions.className = 'd-flex gap-2 flex-wrap justify-content-end';
    actions.innerHTML = `
      <button type="button" class="btn btn-outline-success btn-sm" id="importProductsExcelBtn">
        <i class="bi bi-file-earmark-excel me-1"></i>Importar desde Excel
      </button>
      <button type="button" class="btn btn-outline-danger btn-sm" id="exportCatalogPdfBtn">
        <i class="bi bi-file-pdf me-1"></i>Exportar catálogo PDF
      </button>`;
    actions.appendChild(addButton);
    header.appendChild(actions);
  }

  function mountDashboardFinancialMetrics() {
    if (document.getElementById('dashExpenses')) return;
    const revenueElement = document.getElementById('dashRevenue');
    const baseRow = revenueElement?.closest('.row');
    if (!baseRow) return;

    const row = document.createElement('div');
    row.className = 'row g-3 mb-4';
    row.id = 'kioscoFinancialMetricsRow';
    row.innerHTML = `
      <div class="col-12 col-md-6">
        <div class="stat-card card h-100">
          <div class="stat-icon bg-danger bg-opacity-10 text-danger"><i class="bi bi-receipt-cutoff"></i></div>
          <div>
            <div class="stat-value" id="dashExpenses">${escapeHtml(formatMoney(0))}</div>
            <div class="stat-label">Gastos del período</div>
          </div>
        </div>
      </div>
      <div class="col-12 col-md-6">
        <div class="stat-card card h-100">
          <div class="stat-icon bg-success bg-opacity-10" id="dashNetUtilityIcon"><i class="bi bi-graph-up-arrow"></i></div>
          <div>
            <div class="stat-value text-success" id="dashNetUtility">${escapeHtml(formatMoney(0))}</div>
            <div class="stat-label">Utilidad neta</div>
          </div>
        </div>
      </div>`;
    baseRow.insertAdjacentElement('afterend', row);
  }

  function mountAdminModals() {
    if (document.getElementById('expenseModal')) return;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="modal fade" id="expenseModal" tabindex="-1" aria-labelledby="expenseModalTitle" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <form id="expenseForm">
              <div class="modal-header">
                <h5 class="modal-title" id="expenseModalTitle"><i class="bi bi-receipt-cutoff me-2"></i>Nuevo gasto</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
              </div>
              <div class="modal-body">
                <input type="hidden" id="expenseId">
                <div class="mb-3">
                  <label for="expenseDescription" class="form-label fw-semibold">Descripción</label>
                  <input type="text" class="form-control" id="expenseDescription" maxlength="160" required>
                </div>
                <div class="row g-3">
                  <div class="col-sm-6">
                    <label for="expenseAmount" class="form-label fw-semibold">Monto</label>
                    <div class="input-group"><span class="input-group-text">S/</span><input type="number" class="form-control" id="expenseAmount" min="0.01" step="0.01" required></div>
                  </div>
                  <div class="col-sm-6">
                    <label for="expenseDate" class="form-label fw-semibold">Fecha</label>
                    <input type="date" class="form-control" id="expenseDate" required>
                  </div>
                  <div class="col-12">
                    <label for="expenseCategory" class="form-label fw-semibold">Categoría</label>
                    <select class="form-select" id="expenseCategory" required>
                      ${EXPENSE_CATEGORIES.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('')}
                    </select>
                  </div>
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
                <button type="submit" class="btn btn-primary" id="saveExpenseBtn"><i class="bi bi-save me-2"></i>Guardar</button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div class="modal fade" id="stockReplenishmentModal" tabindex="-1" aria-labelledby="stockReplenishmentTitle" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <form id="stockReplenishmentForm">
              <div class="modal-header">
                <h5 class="modal-title" id="stockReplenishmentTitle"><i class="bi bi-box-arrow-in-down me-2"></i>Reponer stock</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
              </div>
              <div class="modal-body">
                <p class="mb-3" id="stockReplenishmentProduct"></p>
                <div class="row g-3">
                  <div class="col-sm-6"><div class="card h-100"><div class="card-body"><small class="text-body-secondary">Stock actual</small><div class="h4 mb-0 mt-1" id="stockReplenishmentCurrent">0</div></div></div></div>
                  <div class="col-sm-6">
                    <label for="stockReplenishmentQty" class="form-label fw-semibold">Cantidad a sumar</label>
                    <input type="number" class="form-control form-control-lg" id="stockReplenishmentQty" min="1" step="1" value="1" required>
                  </div>
                </div>
                <div class="alert alert-info small mt-3 mb-0"><i class="bi bi-info-circle me-2"></i>La cantidad se sumará al stock actual y el movimiento quedará registrado en Auditoría.</div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
                <button type="submit" class="btn btn-primary" id="saveStockReplenishmentBtn"><i class="bi bi-plus-circle me-2"></i>Sumar stock</button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div class="modal fade" id="productsExcelImportModal" tabindex="-1" aria-labelledby="productsExcelImportTitle" aria-hidden="true">
        <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="productsExcelImportTitle"><i class="bi bi-file-earmark-excel me-2"></i>Importar productos desde Excel</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
            </div>
            <div class="modal-body">
              <div class="row g-4">
                <div class="col-lg-4">
                  <div class="card h-100">
                    <div class="card-body">
                      <h6 class="fw-bold">1. Descarga la plantilla</h6>
                      <p class="small text-body-secondary">Incluye las columnas esperadas y ejemplos compatibles con las categorías actuales.</p>
                      <button type="button" class="btn btn-outline-success w-100" id="downloadProductsTemplateBtn"><i class="bi bi-download me-2"></i>Descargar plantilla Excel</button>
                      <hr>
                      <h6 class="fw-bold">2. Selecciona el archivo</h6>
                      <input type="file" class="form-control" id="productsExcelFile" accept=".xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
                      <div class="form-text">Máximo recomendado: 1,000 filas por operación.</div>
                    </div>
                  </div>
                </div>
                <div class="col-lg-8">
                  <div class="d-flex justify-content-between align-items-center gap-2 mb-2">
                    <h6 class="fw-bold mb-0">Vista previa</h6>
                    <span class="badge text-bg-secondary" id="productsImportRowCount">0 filas</span>
                  </div>
                  <div class="table-responsive border rounded kiosco-import-preview-wrap">
                    <table class="table table-sm table-hover align-middle mb-0">
                      <thead class="table-dark"><tr><th>Fila</th><th>Nombre</th><th>Precio</th><th>Stock</th><th>Categoría</th><th>Activo</th></tr></thead>
                      <tbody id="productsImportPreview"><tr><td colspan="6" class="text-center text-body-secondary py-5">Selecciona un archivo para ver los primeros 5 registros.</td></tr></tbody>
                    </table>
                  </div>
                </div>
              </div>
              <div class="mt-4 d-none" id="productsImportProgressWrap">
                <div class="d-flex justify-content-between small mb-1"><span id="productsImportProgressText">Preparando importación…</span><span id="productsImportProgressPercent">0%</span></div>
                <div class="progress" role="progressbar" aria-label="Progreso de importación"><div class="progress-bar progress-bar-striped progress-bar-animated" id="productsImportProgressBar" style="width:0%"></div></div>
              </div>
              <div class="mt-4 d-none" id="productsImportResult" role="status"></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal" id="closeProductsImportBtn">Cerrar</button>
              <button type="button" class="btn btn-success" id="runProductsImportBtn" disabled><i class="bi bi-cloud-arrow-up me-2"></i>Importar 0 productos</button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.append(...wrapper.children);
  }

  function mountUi() {
    window.COLL = window.COLL || {};
    window.COLL.expenses = window.COLL.expenses || 'expenses';
    mountExpensesNavigation();
    mountExpensesSection();
    mountProductActions();
    mountDashboardFinancialMetrics();
    mountAdminModals();
  }

  function expenseMonth() {
    return document.getElementById('expenseMonthFilter')?.value || localMonthInput();
  }

  function expensesForMonth(month = expenseMonth()) {
    return state.expenses
      .filter(expense => {
        const date = toDate(expense.date);
        return date && localMonthInput(date) === month;
      })
      .sort((a, b) => (toDate(b.date)?.getTime() || 0) - (toDate(a.date)?.getTime() || 0));
  }

  function subscribeExpenses() {
    if (state.expenseUnsubscribe || !window.db || !window.auth?.currentUser) return;
    state.expenseUnsubscribe = db.collection(COLL.expenses || 'expenses').onSnapshot(snapshot => {
      state.expenses = snapshot.docs.map(documentSnapshot => ({ id: documentSnapshot.id, ...documentSnapshot.data() }));
      state.expenses.sort((a, b) => (toDate(b.date)?.getTime() || 0) - (toDate(a.date)?.getTime() || 0));
      renderExpenses();
      renderDashboardFinancials();
    }, error => {
      console.error('Gastos:', error);
      notify(error?.code === 'permission-denied'
        ? 'Sin permiso para consultar gastos. Despliega las reglas de Firestore incluidas.'
        : `No se pudieron cargar los gastos: ${error.message}`, 'danger');
    });
  }

  function unsubscribeExpenses() {
    if (typeof state.expenseUnsubscribe === 'function') state.expenseUnsubscribe();
    state.expenseUnsubscribe = null;
    state.expenses = [];
    renderExpenses();
    renderDashboardFinancials();
  }

  function renderExpenseSummary(list) {
    const totals = Object.fromEntries(EXPENSE_CATEGORIES.map(category => [category, 0]));
    list.forEach(expense => {
      const category = EXPENSE_CATEGORIES.includes(expense.category) ? expense.category : 'Otros';
      totals[category] += Number(expense.amount || 0);
    });

    EXPENSE_CATEGORIES.forEach(category => {
      const element = [...document.querySelectorAll('[data-expense-category-total]')]
        .find(item => item.dataset.expenseCategoryTotal === category);
      if (element) element.textContent = formatMoney(totals[category]);
    });
    const total = Object.values(totals).reduce((sum, value) => sum + value, 0);
    const totalElement = document.getElementById('expensesMonthTotal');
    if (totalElement) totalElement.textContent = formatMoney(total);
  }

  async function renderExpensesChart(list) {
    const canvas = document.getElementById('expensesByDayChart');
    if (!canvas) return;
    try {
      await loadScript(CHART_CDN, 'Chart');
    } catch (error) {
      console.warn('Chart.js para gastos:', error);
      return;
    }

    const [yearValue, monthValue] = expenseMonth().split('-').map(Number);
    const daysInMonth = new Date(yearValue, monthValue, 0).getDate();
    const daily = Array.from({ length: daysInMonth }, () => 0);
    list.forEach(expense => {
      const date = toDate(expense.date);
      if (date) daily[date.getDate() - 1] += Number(expense.amount || 0);
    });

    state.expenseChart?.destroy();
    const styles = getComputedStyle(document.documentElement);
    const accent = styles.getPropertyValue('--accent').trim() || '#f97316';
    const textColor = styles.getPropertyValue('--bs-body-color').trim() || '#6c757d';
    const borderColor = styles.getPropertyValue('--bs-border-color').trim() || 'rgba(127,127,127,.2)';
    state.expenseChart = new window.Chart(canvas, {
      type: 'bar',
      data: {
        labels: daily.map((_, index) => String(index + 1)),
        datasets: [{ label: 'Gastos', data: daily.map(value => Number(value.toFixed(2))), backgroundColor: accent, borderRadius: 5, maxBarThickness: 24 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: context => formatMoney(context.parsed.y) } } },
        scales: {
          x: { title: { display: true, text: 'Día del mes', color: textColor }, ticks: { color: textColor }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: textColor, callback: value => formatMoney(value) }, grid: { color: borderColor } }
        }
      }
    });
  }

  function renderExpensesTable(list) {
    const body = document.getElementById('expensesTableBody');
    if (!body) return;
    if (!window.auth?.currentUser) {
      body.innerHTML = '<tr><td colspan="5" class="text-center text-body-secondary py-5">Inicia sesión para consultar los gastos.</td></tr>';
      return;
    }
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="5" class="text-center text-body-secondary py-5"><i class="bi bi-receipt-cutoff display-6 d-block mb-2"></i>No hay gastos registrados en este mes.</td></tr>';
      return;
    }
    body.innerHTML = list.map(expense => `
      <tr>
        <td class="text-nowrap">${escapeHtml(formatDate(expense.date))}</td>
        <td>${escapeHtml(expense.description || '')}</td>
        <td><span class="badge text-bg-secondary">${escapeHtml(expense.category || 'Otros')}</span></td>
        <td class="text-end fw-semibold">${escapeHtml(formatMoney(expense.amount))}</td>
        <td class="text-end text-nowrap">
          <button type="button" class="btn btn-outline-primary btn-sm" data-edit-expense="${escapeHtml(expense.id)}" aria-label="Editar gasto"><i class="bi bi-pencil"></i></button>
          <button type="button" class="btn btn-outline-danger btn-sm" data-delete-expense="${escapeHtml(expense.id)}" aria-label="Eliminar gasto"><i class="bi bi-trash"></i></button>
        </td>
      </tr>`).join('');
  }

  function renderExpenses() {
    const list = expensesForMonth();
    renderExpenseSummary(list);
    renderExpensesTable(list);
    void renderExpensesChart(list);
  }

  function openExpenseModal(expenseId = null) {
    const form = document.getElementById('expenseForm');
    const expense = expenseId ? state.expenses.find(item => item.id === expenseId) : null;
    state.currentExpenseId = expense?.id || null;
    form?.reset();
    document.getElementById('expenseId').value = expense?.id || '';
    document.getElementById('expenseDescription').value = expense?.description || '';
    document.getElementById('expenseAmount').value = expense ? String(Number(expense.amount || 0)) : '';
    document.getElementById('expenseCategory').value = EXPENSE_CATEGORIES.includes(expense?.category) ? expense.category : 'Mercadería';
    document.getElementById('expenseDate').value = expense ? localDateInput(toDate(expense.date) || new Date()) : localDateInput();
    document.getElementById('expenseModalTitle').innerHTML = `<i class="bi bi-receipt-cutoff me-2"></i>${expense ? 'Editar gasto' : 'Nuevo gasto'}`;
    getModal('expenseModal')?.show();
  }

  async function saveExpense(event) {
    event.preventDefault();
    if (!window.auth?.currentUser) return notify('Debes iniciar sesión como administrador', 'warning');
    const description = document.getElementById('expenseDescription').value.trim();
    const amount = Number(document.getElementById('expenseAmount').value);
    const category = document.getElementById('expenseCategory').value;
    const date = parseLocalDate(document.getElementById('expenseDate').value);
    if (!description) return notify('La descripción es obligatoria', 'warning');
    if (!Number.isFinite(amount) || amount <= 0) return notify('Ingresa un monto mayor que cero', 'warning');
    if (!EXPENSE_CATEGORIES.includes(category)) return notify('Selecciona una categoría válida', 'warning');
    if (!date) return notify('Selecciona una fecha válida', 'warning');

    const button = document.getElementById('saveExpenseBtn');
    const originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Guardando…';
    try {
      const payload = {
        description,
        amount: Number(amount.toFixed(2)),
        category,
        date: firebase.firestore.Timestamp.fromDate(date)
      };
      if (state.currentExpenseId) {
        await db.collection(COLL.expenses || 'expenses').doc(state.currentExpenseId).update(payload);
        notify('Gasto actualizado', 'success');
      } else {
        await db.collection(COLL.expenses || 'expenses').add({
          ...payload,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        notify('Gasto registrado', 'success');
      }
      getModal('expenseModal')?.hide();
    } catch (error) {
      console.error('Guardar gasto:', error);
      notify(`No se pudo guardar el gasto: ${error.message}`, 'danger');
    } finally {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
  }

  async function deleteExpense(expenseId) {
    const expense = state.expenses.find(item => item.id === expenseId);
    if (!expense || !window.confirm(`¿Eliminar el gasto “${expense.description}”?`)) return;
    try {
      await db.collection(COLL.expenses || 'expenses').doc(expense.id).delete();
      notify('Gasto eliminado', 'info');
    } catch (error) {
      console.error('Eliminar gasto:', error);
      notify(`No se pudo eliminar el gasto: ${error.message}`, 'danger');
    }
  }

  async function ensureXlsx() {
    await loadScript(XLSX_CDN, 'XLSX');
    if (!window.XLSX) throw new Error('SheetJS no está disponible');
    return window.XLSX;
  }

  async function exportExpenses() {
    const list = expensesForMonth();
    if (!list.length) return notify('No hay gastos para exportar en este mes', 'warning');
    const button = document.getElementById('exportExpensesBtn');
    const originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Generando…';
    try {
      const XLSX = await ensureXlsx();
      const detail = list.map(expense => ({
        Fecha: formatDate(expense.date),
        Descripción: expense.description || '',
        Categoría: expense.category || 'Otros',
        Monto: Number(expense.amount || 0)
      }));
      const categoryTotals = EXPENSE_CATEGORIES.map(category => ({
        Categoría: category,
        Total: Number(list.filter(expense => expense.category === category).reduce((sum, expense) => sum + Number(expense.amount || 0), 0).toFixed(2))
      }));
      const workbook = XLSX.utils.book_new();
      const detailSheet = XLSX.utils.json_to_sheet(detail);
      detailSheet['!cols'] = [{ wch: 14 }, { wch: 42 }, { wch: 18 }, { wch: 14 }];
      const summarySheet = XLSX.utils.json_to_sheet(categoryTotals);
      summarySheet['!cols'] = [{ wch: 20 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(workbook, detailSheet, 'Gastos');
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen');
      XLSX.writeFile(workbook, `gastos-${expenseMonth()}.xlsx`, { compression: true });
      notify('Excel de gastos descargado', 'success');
    } catch (error) {
      console.error('Exportar gastos:', error);
      notify(`No se pudo exportar el Excel: ${error.message}`, 'danger');
    } finally {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
  }

  function periodRange(period, baseDate = new Date()) {
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

  function renderDashboardFinancials() {
    const { start, end } = periodRange(state.dashboardPeriod);
    const expenses = state.expenses.filter(expense => {
      const date = toDate(expense.date);
      return date && date >= start && date < end;
    }).reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const revenue = state.dashboardOrders.filter(order => {
      const date = toDate(order.createdAt);
      return date && date >= start && date < end && order.status !== 'rejected';
    }).reduce((sum, order) => sum + Number(order.total || 0), 0);
    const net = Number((revenue - expenses).toFixed(2));
    const isPositive = net > 0;
    const isNegative = net < 0;
    const isNeutral = !isPositive && !isNegative;

    const expensesElement = document.getElementById('dashExpenses');
    const netElement = document.getElementById('dashNetUtility');
    const iconElement = document.getElementById('dashNetUtilityIcon');
    if (expensesElement) expensesElement.textContent = formatMoney(expenses);
    if (netElement) {
      netElement.textContent = formatMoney(net);
      netElement.classList.toggle('text-success', isPositive);
      netElement.classList.toggle('text-danger', isNegative);
      netElement.classList.toggle('text-body-secondary', isNeutral);
    }
    if (iconElement) {
      iconElement.classList.toggle('text-success', isPositive);
      iconElement.classList.toggle('text-danger', isNegative);
      iconElement.classList.toggle('text-body-secondary', isNeutral);
      iconElement.classList.toggle('bg-success', isPositive);
      iconElement.classList.toggle('bg-danger', isNegative);
      iconElement.classList.toggle('bg-secondary', isNeutral);
    }
  }

  function getAdminApi() {
    if (window.Admin) return window.Admin;
    try {
      return typeof Admin !== 'undefined' ? Admin : null;
    } catch (error) {
      return null;
    }
  }

  function getAdminProducts() {
    const products = getAdminApi()?.getProducts?.();
    if (Array.isArray(products)) state.adminProducts = products;
    return state.adminProducts;
  }

  function getAdminCategories() {
    const categories = getAdminApi()?.getCategories?.();
    if (Array.isArray(categories)) state.adminCategories = categories;
    return state.adminCategories;
  }

  function decorateAdminProductCards() {
    const products = getAdminProducts();
    const byId = new Map(products.map(product => [normalizeId(product.id), product]));
    document.querySelectorAll('#adminProductsGrid [data-admin-product-id]').forEach(container => {
      const product = byId.get(normalizeId(container.dataset.adminProductId));
      if (!product) return;
      const card = container.matches('.card') ? container : container.querySelector('.card');
      if (!card) return;

      const stock = product.stock === null || product.stock === undefined || product.stock === ''
        ? null
        : Math.max(0, Math.trunc(Number(product.stock) || 0));
      const decorationSignature = [
        normalizeId(product.id),
        stock === null ? 'unlimited' : String(stock),
        product.active !== false ? 'active' : 'inactive',
        normalizeName(product.name)
      ].join('|');
      if (card.dataset.kioscoAdminDecoration === decorationSignature
          && card.querySelector('.kiosco-admin-extra-actions')) return;
      card.dataset.kioscoAdminDecoration = decorationSignature;
      card.querySelectorAll('[data-kiosco-stock-badge], .kiosco-admin-extra-actions').forEach(element => element.remove());
      const imageWrap = card.querySelector('.card-img-wrap');
      if (imageWrap && stock !== null && stock <= 5) {
        imageWrap.classList.add('position-relative');
        const badge = document.createElement('span');
        badge.dataset.kioscoStockBadge = 'true';
        badge.className = stock === 0
          ? 'badge bg-danger position-absolute top-0 end-0 m-2 kiosco-stock-out-badge'
          : 'badge bg-warning text-dark position-absolute top-0 end-0 m-2';
        badge.textContent = stock === 0 ? 'Sin stock' : 'Stock bajo';
        imageWrap.appendChild(badge);
      }

      const actions = document.createElement('div');
      actions.className = 'kiosco-admin-extra-actions d-flex gap-2 p-2 pt-0';
      actions.innerHTML = `
        <button type="button" class="btn btn-outline-primary btn-sm flex-grow-1" data-replenish-product="${escapeHtml(product.id)}" ${stock === null ? 'disabled title="Producto con stock ilimitado"' : ''}>
          <i class="bi bi-box-arrow-in-down me-1"></i>Reponer stock
        </button>
        <button type="button" class="btn btn-outline-secondary btn-sm" data-admin-product-qr="${escapeHtml(product.id)}" title="Generar QR" aria-label="Generar QR de ${escapeHtml(product.name)}">
          <i class="bi bi-qr-code"></i>
        </button>`;
      card.appendChild(actions);
    });
  }

  function observeAdminProductGrid() {
    const grid = document.getElementById('adminProductsGrid');
    if (!grid || state.adminGridObserver) return;
    state.adminGridObserver = new MutationObserver(() => decorateAdminProductCards());
    state.adminGridObserver.observe(grid, { childList: true, subtree: true });
    decorateAdminProductCards();
  }

  function openReplenishmentModal(productId) {
    const product = getAdminProducts().find(item => item.id === productId);
    if (!product) return notify('Producto no encontrado', 'warning');
    if (product.stock === null || product.stock === undefined || product.stock === '') {
      return notify('Este producto usa stock ilimitado', 'warning');
    }
    state.replenishmentProductId = product.id;
    document.getElementById('stockReplenishmentTitle').innerHTML = '<i class="bi bi-box-arrow-in-down me-2"></i>Reponer stock';
    document.getElementById('stockReplenishmentProduct').innerHTML = `<strong>${escapeHtml(product.name)}</strong>`;
    document.getElementById('stockReplenishmentCurrent').textContent = String(Math.max(0, Math.trunc(Number(product.stock) || 0)));
    document.getElementById('stockReplenishmentQty').value = '1';
    getModal('stockReplenishmentModal')?.show();
  }

  async function saveStockReplenishment(event) {
    event.preventDefault();
    const productId = state.replenishmentProductId;
    const addedQty = Math.trunc(Number(document.getElementById('stockReplenishmentQty').value));
    if (!productId) return notify('Producto no seleccionado', 'warning');
    if (!Number.isFinite(addedQty) || addedQty <= 0) return notify('La cantidad debe ser un entero mayor que cero', 'warning');
    if (!window.auth?.currentUser) return notify('Debes iniciar sesión como administrador', 'warning');

    const button = document.getElementById('saveStockReplenishmentBtn');
    const originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Actualizando…';
    try {
      const productReference = db.collection(COLL.products).doc(productId);
      const auditReference = db.collection(COLL.audit || 'audit_log').doc();
      const user = auth.currentUser;
      let result = null;
      await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(productReference);
        if (!snapshot.exists) throw new Error('El producto ya no existe');
        const product = snapshot.data() || {};
        if (product.stock === null || product.stock === undefined || product.stock === '') throw new Error('El producto usa stock ilimitado');
        const previousStock = Math.max(0, Math.trunc(Number(product.stock) || 0));
        const newStock = previousStock + addedQty;
        transaction.update(productReference, {
          stock: newStock,
          active: true,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        transaction.set(auditReference, {
          action: 'stock_replenishment',
          actionLabel: 'Reposición de stock',
          module: 'Productos',
          entityPath: `products/${productId}`,
          entityId: productId,
          description: `${String(product.name || 'Producto')}: +${addedQty} unidades (${previousStock} → ${newStock})`,
          product: { id: productId, name: String(product.name || 'Producto') },
          previousStock,
          addedQty,
          newStock,
          admin: {
            uid: user.uid || null,
            phone: user.phoneNumber || null,
            email: user.email || null
          },
          actor: {
            uid: user.uid || null,
            phone: user.phoneNumber || null,
            name: user.displayName || user.phoneNumber || user.email || 'Administrador',
            role: 'admin'
          },
          clientCreatedAt: new Date().toISOString(),
          userAgent: navigator.userAgent || null,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        result = { previousStock, newStock, name: String(product.name || 'Producto') };
      });
      notify(`${result.name}: stock actualizado de ${result.previousStock} a ${result.newStock}`, 'success');
      getModal('stockReplenishmentModal')?.hide();
    } catch (error) {
      console.error('Reposición de stock:', error);
      notify(`No se pudo reponer el stock: ${error.message}`, 'danger');
    } finally {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
  }

  function hexToRgb(hex) {
    const clean = String(hex || '#f97316').replace('#', '');
    const value = clean.length === 3 ? clean.split('').map(char => char + char).join('') : clean.padEnd(6, '0').slice(0, 6);
    return [parseInt(value.slice(0, 2), 16) || 249, parseInt(value.slice(2, 4), 16) || 115, parseInt(value.slice(4, 6), 16) || 22];
  }

  function imageToDataUrl(source, maxWidth = 480, maxHeight = 480) {
    if (!source) return Promise.resolve(null);
    return new Promise(resolve => {
      const image = new Image();
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(value);
      };
      const timeoutId = window.setTimeout(() => finish(null), 8000);
      image.crossOrigin = 'anonymous';
      image.referrerPolicy = 'no-referrer';
      image.decoding = 'async';
      image.onload = () => {
        try {
          const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight, 1);
          const width = Math.max(1, Math.round(image.naturalWidth * scale));
          const height = Math.max(1, Math.round(image.naturalHeight * scale));
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d');
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, width, height);
          context.drawImage(image, 0, 0, width, height);
          finish(canvas.toDataURL('image/jpeg', 0.82));
        } catch (error) {
          console.warn('Conversión de imagen para PDF:', error);
          finish(null);
        }
      };
      image.onerror = () => finish(null);
      image.src = source;
    });
  }

  async function mapWithConcurrency(list, concurrency, mapper) {
    const result = new Array(list.length);
    let nextIndex = 0;
    async function worker() {
      while (nextIndex < list.length) {
        const index = nextIndex;
        nextIndex += 1;
        result[index] = await mapper(list[index], index);
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(list.length, 1)) }, worker));
    return result;
  }

  async function getThemeConfig() {
    try {
      const snapshot = await db.collection(COLL.config).doc('theme').get();
      return snapshot.exists ? snapshot.data() || {} : {};
    } catch (error) {
      console.warn('Tema para catálogo:', error);
      return {};
    }
  }

  async function exportCatalogPdf() {
    if (state.exportInProgress) return;
    const products = getAdminProducts();
    if (!products.length) return notify('No hay productos para exportar', 'warning');
    const button = document.getElementById('exportCatalogPdfBtn');
    const originalHtml = button.innerHTML;
    state.exportInProgress = true;
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Preparando catálogo…';

    try {
      await loadScript(JSPDF_CDN, 'jspdf');
      const JsPdf = window.jspdf?.jsPDF;
      if (!JsPdf) throw new Error('jsPDF no está disponible');
      const categories = getAdminCategories();
      const categoryNames = new Map(categories.map(category => [category.id, category.name || 'Sin categoría']));
      const theme = await getThemeConfig();
      const storeName = String(theme.storeName || document.querySelector('.logo-text')?.textContent || 'Kiosco').trim();
      const logoUrl = String(theme.storeLogoUrl || '').trim();
      const accent = hexToRgb(theme.accentColor || '#f97316');
      const logoData = await imageToDataUrl(logoUrl, 360, 360);

      button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Procesando imágenes…';
      const productImages = await mapWithConcurrency(products, 4, product => imageToDataUrl(product.resolvedImageUrl || product.imageUrl, 240, 240));
      const imageById = new Map(products.map((product, index) => [product.id, productImages[index]]));

      const doc = new JsPdf({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 12;

      doc.setFillColor(...accent);
      doc.rect(0, 0, pageWidth, 72, 'F');
      if (logoData) {
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(pageWidth / 2 - 24, 18, 48, 48, 5, 5, 'F');
        doc.addImage(logoData, 'JPEG', pageWidth / 2 - 21, 21, 42, 42, undefined, 'FAST');
      } else {
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(26);
        doc.text('K', pageWidth / 2, 47, { align: 'center' });
      }
      doc.setTextColor(33, 37, 41);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(28);
      doc.text(storeName, pageWidth / 2, 100, { align: 'center', maxWidth: pageWidth - 32 });
      doc.setTextColor(...accent);
      doc.setFontSize(17);
      doc.text('Catálogo de productos', pageWidth / 2, 114, { align: 'center' });
      doc.setTextColor(90, 90, 90);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.text(`Generado: ${new Date().toLocaleDateString('es-PE')}`, pageWidth / 2, 134, { align: 'center' });
      doc.text(`Total de productos: ${products.length}`, pageWidth / 2, 143, { align: 'center' });
      doc.setDrawColor(...accent);
      doc.setLineWidth(1);
      doc.line(55, 158, pageWidth - 55, 158);
      doc.setFontSize(9);
      doc.setTextColor(110, 110, 110);
      doc.text('Precios y disponibilidad sujetos a actualización en la tienda digital.', pageWidth / 2, 176, { align: 'center' });

      const groups = new Map();
      products.forEach(product => {
        const categoryName = categoryNames.get(product.categoryId) || 'Sin categoría';
        if (!groups.has(categoryName)) groups.set(categoryName, []);
        groups.get(categoryName).push(product);
      });
      const sortedGroups = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'));
      sortedGroups.forEach(([, list]) => list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es')));

      const columns = [
        { key: 'image', title: 'Imagen', x: margin, width: 24 },
        { key: 'name', title: 'Nombre', x: margin + 24, width: 35 },
        { key: 'description', title: 'Descripción', x: margin + 59, width: 50 },
        { key: 'category', title: 'Categoría', x: margin + 109, width: 28 },
        { key: 'price', title: 'Precio', x: margin + 137, width: 22 },
        { key: 'stock', title: 'Stock', x: margin + 159, width: 15 }
      ];
      let y = 18;

      function addContentPage() {
        doc.addPage();
        y = 16;
      }

      function drawTableHeader() {
        doc.setFillColor(40, 40, 44);
        doc.rect(margin, y, pageWidth - margin * 2, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        columns.forEach(column => doc.text(column.title, column.x + 1, y + 5));
        doc.setTextColor(35, 35, 35);
        y += 10;
      }

      addContentPage();
      for (const [categoryName, groupProducts] of sortedGroups) {
        if (y > pageHeight - 35) addContentPage();
        doc.setFillColor(...accent);
        doc.roundedRect(margin, y, pageWidth - margin * 2, 9, 2, 2, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(`${categoryName} (${groupProducts.length})`, margin + 3, y + 6);
        y += 11;
        drawTableHeader();

        for (const product of groupProducts) {
          const values = {
            name: String(product.name || 'Sin nombre'),
            description: String(product.description || 'Sin descripción'),
            category: categoryName,
            price: formatMoney(product.price),
            stock: product.stock === null || product.stock === undefined || product.stock === '' ? 'Ilimitado' : String(Math.max(0, Number(product.stock) || 0))
          };
          const wrapped = {
            name: doc.splitTextToSize(values.name, columns[1].width - 2),
            description: doc.splitTextToSize(values.description, columns[2].width - 2),
            category: doc.splitTextToSize(values.category, columns[3].width - 2),
            price: doc.splitTextToSize(values.price, columns[4].width - 2),
            stock: doc.splitTextToSize(values.stock, columns[5].width - 2)
          };
          const textHeight = Math.max(...Object.values(wrapped).map(lines => lines.length * 3.4 + 4));
          const rowHeight = Math.max(22, textHeight);
          if (y + rowHeight > pageHeight - 18) {
            addContentPage();
            drawTableHeader();
          }

          doc.setDrawColor(210, 210, 210);
          doc.rect(margin, y, pageWidth - margin * 2, rowHeight);
          columns.slice(1).forEach(column => doc.line(column.x, y, column.x, y + rowHeight));
          const imageData = imageById.get(product.id);
          if (imageData) {
            const size = Math.min(18, rowHeight - 4);
            doc.addImage(imageData, 'JPEG', columns[0].x + 3, y + 2, size, size, undefined, 'FAST');
          } else {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.5);
            doc.setTextColor(130, 130, 130);
            doc.text('Sin imagen', columns[0].x + columns[0].width / 2, y + rowHeight / 2, { align: 'center' });
          }
          doc.setTextColor(40, 40, 40);
          doc.setFontSize(7.3);
          doc.setFont('helvetica', 'bold');
          doc.text(wrapped.name, columns[1].x + 1, y + 4);
          doc.setFont('helvetica', 'normal');
          doc.text(wrapped.description, columns[2].x + 1, y + 4);
          doc.text(wrapped.category, columns[3].x + 1, y + 4);
          doc.text(wrapped.price, columns[4].x + 1, y + 4);
          doc.text(wrapped.stock, columns[5].x + 1, y + 4);
          y += rowHeight;
        }
        y += 5;
      }

      const pageCount = doc.getNumberOfPages();
      for (let page = 1; page <= pageCount; page += 1) {
        doc.setPage(page);
        doc.setDrawColor(...accent);
        doc.setLineWidth(0.35);
        doc.line(margin, pageHeight - 11, pageWidth - margin, pageHeight - 11);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 100, 100);
        doc.text(storeName, margin, pageHeight - 6);
        doc.text(`Página ${page} de ${pageCount}`, pageWidth - margin, pageHeight - 6, { align: 'right' });
      }

      const date = localDateInput();
      doc.save(`catalogo-${date}.pdf`);
      notify('Catálogo PDF generado', 'success');
    } catch (error) {
      console.error('Catálogo PDF:', error);
      notify(`No se pudo generar el catálogo: ${error.message}`, 'danger');
    } finally {
      state.exportInProgress = false;
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
  }

  function resetImportModal() {
    state.importRows = [];
    state.importFileName = '';
    state.importInProgress = false;
    const fileInput = document.getElementById('productsExcelFile');
    if (fileInput) fileInput.value = '';
    document.getElementById('productsImportRowCount').textContent = '0 filas';
    document.getElementById('productsImportPreview').innerHTML = '<tr><td colspan="6" class="text-center text-body-secondary py-5">Selecciona un archivo para ver los primeros 5 registros.</td></tr>';
    document.getElementById('runProductsImportBtn').disabled = true;
    document.getElementById('runProductsImportBtn').innerHTML = '<i class="bi bi-cloud-arrow-up me-2"></i>Importar 0 productos';
    document.getElementById('productsImportProgressWrap').classList.add('d-none');
    document.getElementById('productsImportResult').classList.add('d-none');
    document.getElementById('productsImportResult').innerHTML = '';
  }

  async function downloadProductsTemplate() {
    try {
      const XLSX = await ensureXlsx();
      const categories = getAdminCategories();
      const main = categories.find(category => !category.parentId);
      const sub = categories.find(category => category.parentId === main?.id) || categories.find(category => category.parentId);
      const rows = [
        {
          nombre: 'Producto de ejemplo',
          descripcion: 'Descripción completa del producto',
          precio: 9.9,
          stock: 25,
          categoria: main?.name || 'Nombre de categoría existente',
          subcategoria: sub?.name || '',
          imageUrl: 'https://ejemplo.com/imagen.jpg',
          activo: 'SI'
        },
        {
          nombre: 'Producto con stock ilimitado',
          descripcion: '',
          precio: 5.5,
          stock: '',
          categoria: main?.name || '',
          subcategoria: '',
          imageUrl: '',
          activo: 'SI'
        }
      ];
      const sheet = XLSX.utils.json_to_sheet(rows, { header: ['nombre', 'descripcion', 'precio', 'stock', 'categoria', 'subcategoria', 'imageUrl', 'activo'] });
      sheet['!cols'] = [{ wch: 30 }, { wch: 45 }, { wch: 12 }, { wch: 12 }, { wch: 24 }, { wch: 24 }, { wch: 45 }, { wch: 10 }];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, 'Productos');
      XLSX.writeFile(workbook, 'plantilla-importacion-productos.xlsx', { compression: true });
      notify('Plantilla descargada', 'success');
    } catch (error) {
      console.error('Plantilla Excel:', error);
      notify(`No se pudo generar la plantilla: ${error.message}`, 'danger');
    }
  }

  function canonicalImportRow(raw, rowNumber) {
    const headers = new Map(Object.keys(raw || {}).map(key => [normalizeName(key), key]));
    const read = name => raw?.[headers.get(normalizeName(name))] ?? '';
    return {
      rowNumber,
      nombre: read('nombre'),
      descripcion: read('descripcion'),
      precio: read('precio'),
      stock: read('stock'),
      categoria: read('categoria'),
      subcategoria: read('subcategoria'),
      imageUrl: read('imageUrl'),
      activo: read('activo')
    };
  }

  function renderImportPreview() {
    const body = document.getElementById('productsImportPreview');
    const count = state.importRows.length;
    document.getElementById('productsImportRowCount').textContent = `${count} ${count === 1 ? 'fila' : 'filas'}`;
    document.getElementById('runProductsImportBtn').disabled = count === 0;
    document.getElementById('runProductsImportBtn').innerHTML = `<i class="bi bi-cloud-arrow-up me-2"></i>Importar ${count} productos`;
    if (!count) {
      body.innerHTML = '<tr><td colspan="6" class="text-center text-body-secondary py-5">El archivo no contiene filas de productos.</td></tr>';
      return;
    }
    body.innerHTML = state.importRows.slice(0, 5).map(row => `
      <tr>
        <td>${row.rowNumber}</td>
        <td>${escapeHtml(row.nombre)}</td>
        <td>${escapeHtml(row.precio)}</td>
        <td>${row.stock === '' || row.stock == null ? '<span class="text-body-secondary">Ilimitado</span>' : escapeHtml(row.stock)}</td>
        <td>${escapeHtml(row.categoria || '—')}</td>
        <td>${escapeHtml(row.activo || 'SI')}</td>
      </tr>`).join('');
  }

  async function readProductsExcel(file) {
    if (!file) return;
    if (!/\.(xlsx|xls)$/i.test(file.name)) return notify('Selecciona un archivo .xlsx o .xls', 'warning');
    try {
      const XLSX = await ensureXlsx();
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array', cellDates: false });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!firstSheet) throw new Error('El archivo no contiene hojas');
      const rawRows = XLSX.utils.sheet_to_json(firstSheet, { defval: '', raw: true });
      state.importRows = rawRows
        .map((raw, index) => canonicalImportRow(raw, index + 2))
        .filter(row => Object.entries(row).some(([key, value]) => key !== 'rowNumber' && String(value ?? '').trim() !== ''));
      state.importFileName = file.name;
      document.getElementById('productsImportResult').classList.add('d-none');
      renderImportPreview();
    } catch (error) {
      console.error('Lectura Excel:', error);
      state.importRows = [];
      renderImportPreview();
      notify(`No se pudo leer el archivo: ${error.message}`, 'danger');
    }
  }

  function parseDecimal(value) {
    if (typeof value === 'number') return value;
    const normalized = String(value ?? '').trim().replace(/\s/g, '').replace(',', '.');
    return normalized === '' ? NaN : Number(normalized);
  }

  function validateImportRow(row) {
    const errors = [];
    const name = String(row.nombre ?? '').trim();
    const description = String(row.descripcion ?? '').trim();
    const price = parseDecimal(row.precio);
    const stockRaw = String(row.stock ?? '').trim();
    const stockNumber = stockRaw === '' ? null : Number(stockRaw);
    const categoryName = String(row.categoria ?? '').trim();
    const subcategoryName = String(row.subcategoria ?? '').trim();
    const imageUrl = String(row.imageUrl ?? '').trim();
    const activeRaw = normalizeName(row.activo || 'SI');

    if (!name) errors.push('nombre requerido');
    if (!Number.isFinite(price) || price < 0) errors.push('precio inválido');
    if (stockNumber !== null && (!Number.isInteger(stockNumber) || stockNumber < 0)) errors.push('stock debe ser un entero mayor o igual a 0, o quedar vacío');
    if (imageUrl) {
      try {
        const url = new URL(imageUrl);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol');
      } catch (error) {
        errors.push('imageUrl inválida');
      }
    }

    let active = true;
    if (['si', 'sí', 'yes', 'true', '1'].includes(activeRaw)) active = true;
    else if (['no', 'false', '0'].includes(activeRaw)) active = false;
    else errors.push('activo debe ser SI o NO');

    const categories = getAdminCategories();
    const mainCategories = categories.filter(category => !category.parentId);
    const category = categoryName
      ? mainCategories.find(item => normalizeName(item.name) === normalizeName(categoryName))
      : null;
    if (categoryName && !category) errors.push(`categoría “${categoryName}” no existe`);

    let subcategory = null;
    if (subcategoryName) {
      subcategory = categories.find(item => item.parentId && normalizeName(item.name) === normalizeName(subcategoryName)
        && (!category || item.parentId === category.id));
      if (!subcategory) errors.push(`subcategoría “${subcategoryName}” no existe${category ? ` dentro de ${category.name}` : ''}`);
    }

    const categoryId = category?.id || (subcategory?.parentId || null);
    if (errors.length) return { valid: false, errors };
    return {
      valid: true,
      payload: {
        name,
        description,
        price: Number(price.toFixed(2)),
        stock: stockNumber,
        categoryId,
        subcategoryId: subcategory?.id || null,
        imageUrl: imageUrl || null,
        active,
        unit: 'Unidad',
        discountPercent: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }
    };
  }

  function updateImportProgress(done, total) {
    const percent = total ? Math.round((done / total) * 100) : 0;
    document.getElementById('productsImportProgressWrap').classList.remove('d-none');
    document.getElementById('productsImportProgressText').textContent = `Procesando ${done} de ${total} filas…`;
    document.getElementById('productsImportProgressPercent').textContent = `${percent}%`;
    document.getElementById('productsImportProgressBar').style.width = `${percent}%`;
  }

  function renderImportResult(imported, errors) {
    const result = document.getElementById('productsImportResult');
    result.className = `mt-4 alert ${errors.length ? 'alert-warning' : 'alert-success'}`;
    result.innerHTML = `
      <div class="fw-bold mb-2">${imported} productos importados, ${errors.length} errores</div>
      ${errors.length ? `<details><summary class="small fw-semibold">Ver detalle de errores</summary><ul class="small mb-0 mt-2">${errors.map(error => `<li>Fila ${error.row}: ${escapeHtml(error.reason)}</li>`).join('')}</ul></details>` : '<div class="small">La importación finalizó correctamente.</div>'}`;
  }

  async function runProductsImport() {
    if (state.importInProgress || !state.importRows.length) return;
    if (!window.auth?.currentUser) return notify('Debes iniciar sesión como administrador', 'warning');
    state.importInProgress = true;
    const button = document.getElementById('runProductsImportBtn');
    const closeButton = document.getElementById('closeProductsImportBtn');
    button.disabled = true;
    closeButton.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Importando…';
    document.getElementById('productsImportResult').classList.add('d-none');

    let imported = 0;
    let processed = 0;
    const errors = [];
    const validRows = [];
    state.importRows.forEach(row => {
      const validation = validateImportRow(row);
      if (!validation.valid) {
        errors.push({ row: row.rowNumber, reason: validation.errors.join('; ') });
        processed += 1;
      } else {
        validRows.push({ row, payload: validation.payload });
      }
    });
    updateImportProgress(processed, state.importRows.length);

    try {
      for (let start = 0; start < validRows.length; start += BATCH_SIZE) {
        const batch = validRows.slice(start, start + BATCH_SIZE);
        const results = await Promise.all(batch.map(async entry => {
          try {
            await db.collection(COLL.products).add(entry.payload);
            return { ok: true, row: entry.row.rowNumber };
          } catch (error) {
            return { ok: false, row: entry.row.rowNumber, reason: error.message };
          }
        }));
        results.forEach(result => {
          processed += 1;
          if (result.ok) imported += 1;
          else errors.push({ row: result.row, reason: result.reason });
        });
        updateImportProgress(processed, state.importRows.length);
        await new Promise(resolve => window.setTimeout(resolve, 0));
      }
      renderImportResult(imported, errors.sort((a, b) => a.row - b.row));
      notify(`${imported} productos importados`, errors.length ? 'warning' : 'success');
    } catch (error) {
      console.error('Importación de productos:', error);
      errors.push({ row: 'general', reason: error.message });
      renderImportResult(imported, errors);
      notify(`La importación se interrumpió: ${error.message}`, 'danger');
    } finally {
      state.importInProgress = false;
      button.disabled = false;
      closeButton.disabled = false;
      button.innerHTML = `<i class="bi bi-cloud-arrow-up me-2"></i>Importar ${state.importRows.length} productos`;
    }
  }

  function bindEvents() {
    document.getElementById('addExpenseBtn')?.addEventListener('click', () => openExpenseModal());
    document.getElementById('exportExpensesBtn')?.addEventListener('click', exportExpenses);
    document.getElementById('expenseMonthFilter')?.addEventListener('change', renderExpenses);
    document.getElementById('expenseForm')?.addEventListener('submit', saveExpense);
    document.getElementById('stockReplenishmentForm')?.addEventListener('submit', saveStockReplenishment);
    document.getElementById('importProductsExcelBtn')?.addEventListener('click', () => {
      resetImportModal();
      getModal('productsExcelImportModal')?.show();
    });
    document.getElementById('exportCatalogPdfBtn')?.addEventListener('click', exportCatalogPdf);
    document.getElementById('downloadProductsTemplateBtn')?.addEventListener('click', downloadProductsTemplate);
    document.getElementById('productsExcelFile')?.addEventListener('change', event => readProductsExcel(event.target.files?.[0]));
    document.getElementById('runProductsImportBtn')?.addEventListener('click', runProductsImport);

    document.addEventListener('click', event => {
      const expenseNavigation = event.target.closest('[data-admin-section="expenses"]');
      if (expenseNavigation) {
        openExpensesSection(event);
        return;
      }
      const editButton = event.target.closest('[data-edit-expense]');
      if (editButton) {
        openExpenseModal(editButton.dataset.editExpense);
        return;
      }
      const deleteButton = event.target.closest('[data-delete-expense]');
      if (deleteButton) {
        void deleteExpense(deleteButton.dataset.deleteExpense);
        return;
      }
      const replenishButton = event.target.closest('[data-replenish-product]');
      if (replenishButton) {
        openReplenishmentModal(replenishButton.dataset.replenishProduct);
        return;
      }
      const qrButton = event.target.closest('[data-admin-product-qr]');
      if (qrButton) {
        const product = getAdminProducts().find(item => item.id === qrButton.dataset.adminProductQr);
        if (product) window.KioscoProductExperience?.openProductQr?.(product);
      }
    });

    window.addEventListener('admin:products-updated', event => {
      state.adminProducts = Array.isArray(event.detail?.products) ? event.detail.products : [];
      decorateAdminProductCards();
    });
    window.addEventListener('admin:categories-updated', event => {
      state.adminCategories = Array.isArray(event.detail?.categories) ? event.detail.categories : [];
    });
    window.addEventListener('dashboard:data-updated', event => {
      state.dashboardOrders = Array.isArray(event.detail?.orders) ? event.detail.orders : state.dashboardOrders;
      state.dashboardPeriod = event.detail?.period || state.dashboardPeriod;
      renderDashboardFinancials();
    });
    window.addEventListener('dashboard:period-changed', event => {
      state.dashboardPeriod = event.detail?.period || 'day';
      renderDashboardFinancials();
    });
    window.addEventListener('kiosco:themechange', () => {
      renderExpenses();
      renderDashboardFinancials();
    });

    window.auth?.onAuthStateChanged?.(user => {
      if (user) subscribeExpenses();
      else unsubscribeExpenses();
    });
  }

  function bootstrapData() {
    state.adminProducts = getAdminApi()?.getProducts?.() || [];
    state.adminCategories = getAdminApi()?.getCategories?.() || [];
    state.dashboardOrders = window.Dashboard?.getOrders?.() || [];
    state.dashboardPeriod = window.Dashboard?.getPeriod?.() || 'day';
    observeAdminProductGrid();
    if (window.auth?.currentUser) subscribeExpenses();
    renderExpenses();
    renderDashboardFinancials();
  }

  mountUi();
  bindEvents();
  bootstrapData();

  window.KioscoAdminOperations = Object.freeze({
    version: VERSION,
    renderExpenses,
    exportExpenses,
    exportCatalogPdf,
    openExpenseModal,
    openReplenishmentModal,
    decorateAdminProductCards,
    getExpenses: () => state.expenses.map(expense => ({ ...expense }))
  });
})();
