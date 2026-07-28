/* KIOSCO_AUDIT: registro inmutable de acciones administrativas y exportación PDF */
(function initializeKioscoAudit() {
  'use strict';

  const AUDIT_COLLECTION = 'audit_log';
  const MAX_VISIBLE_LOGS = 1000;
  const SESSION_LOGIN_KEY = 'kk_audit_login_recorded';
  const state = {
    initialized: false,
    firestorePatched: false,
    period: 'day',
    logs: [],
    unsubscribe: null,
    staff: [],
    staffLoadedAt: 0,
    originals: null
  };

  const entityLabels = {
    products: 'Productos',
    categories: 'Categorías',
    orders: 'Pedidos',
    receipts: 'Recibos',
    paymentProofs: 'Comprobantes de pago',
    config: 'Configuración',
    chats: 'Chat'
  };

  const actionLabels = {
    create: 'Creación',
    set: 'Guardado',
    update: 'Actualización',
    delete: 'Eliminación',
    login: 'Inicio de sesión',
    logout: 'Cierre de sesión'
  };

  function esc(value) {
    if (typeof window.esc === 'function') return window.esc(value);
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function toast(message, type = 'info') {
    if (typeof window.showToast === 'function') window.showToast(message, type);
    else console[type === 'danger' ? 'error' : 'log'](message);
  }

  function isAdminSession() {
    return Boolean(window.auth?.currentUser && localStorage.getItem('kk_role') === 'admin');
  }

  function moduleFromPath(path) {
    const [collection, documentId] = String(path || '').split('/');
    if (collection === 'config') {
      const configLabels = {
        staff: 'Personal',
        theme: 'Apariencia',
        settings: 'Horario y configuración',
        payments: 'Métodos de pago',
        billing: 'Facturación',
        admin: 'Administradores'
      };
      return configLabels[documentId] || 'Configuración';
    }
    return entityLabels[collection] || collection || 'Sistema';
  }

  function entityIdFromPath(path) {
    const parts = String(path || '').split('/');
    return parts.length > 1 ? parts[parts.length - 1] : null;
  }

  function safeValue(value, maxLength = 100) {
    if (value == null) return '';
    if (typeof value === 'string') return value.slice(0, maxLength);
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return '';
  }

  function describeMutation(path, data, action) {
    const [collection, documentId] = String(path || '').split('/');
    const source = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    const details = [];

    if (collection === 'products') {
      const name = safeValue(source.name);
      if (name) details.push(name);
      if (source.stock != null) details.push(`stock ${safeValue(source.stock)}`);
      if (source.price != null) details.push(`precio S/ ${Number(source.price || 0).toFixed(2)}`);
    } else if (collection === 'categories') {
      const name = safeValue(source.name);
      if (name) details.push(name);
      if (source.parentId) details.push('subcategoría');
    } else if (collection === 'orders') {
      if (source.status) details.push(`estado ${safeValue(source.status)}`);
      if (source.total != null) details.push(`total S/ ${Number(source.total || 0).toFixed(2)}`);
      if (source.customer) details.push(`cliente ${safeValue(source.customer, 60)}`);
    } else if (collection === 'receipts') {
      if (source.receiptNumber) details.push(safeValue(source.receiptNumber));
      if (source.orderId) details.push(`pedido ${safeValue(source.orderId, 40)}`);
    } else if (collection === 'paymentProofs') {
      details.push(`pedido ${safeValue(documentId, 40)}`);
      if (source.paymentMethod) details.push(safeValue(source.paymentMethod));
    } else if (collection === 'config') {
      if (documentId === 'staff') details.push('lista de personal');
      else if (documentId === 'theme') details.push('identidad visual');
      else if (documentId === 'settings') details.push('horario/configuración');
      else if (documentId === 'payments') details.push('cuentas de pago');
      else if (documentId === 'billing') details.push('datos de facturación');
      else details.push(safeValue(documentId, 60));
    }

    const label = moduleFromPath(path);
    const verb = actionLabels[action] || action;
    return `${verb} en ${label}${details.length ? `: ${details.join(' · ')}` : ''}`.slice(0, 420);
  }

  async function loadStaff() {
    const now = Date.now();
    if (state.staffLoadedAt && now - state.staffLoadedAt < 5 * 60 * 1000) return state.staff;
    try {
      const snapshot = await window.db.collection(window.COLL?.config || 'config').doc('staff').get();
      state.staff = snapshot.exists && Array.isArray(snapshot.data()?.members)
        ? snapshot.data().members
        : [];
    } catch (error) {
      console.warn('Auditoría: no se pudo cargar personal:', error?.message || error);
      state.staff = [];
    }
    state.staffLoadedAt = now;
    return state.staff;
  }

  async function resolveIdentity(user = window.auth?.currentUser) {
    const phone = user?.phoneNumber || '';
    const staff = await loadStaff();
    const member = staff.find(item => String(item?.phone || '') === phone);
    return {
      uid: user?.uid || null,
      phone: phone || null,
      name: safeValue(member?.name || user?.displayName || 'Administrador', 100),
      role: safeValue(member?.role || 'admin', 40)
    };
  }

  async function writeAudit({ action, path = '', data = null, description = '', identity = null }) {
    if (!window.db || !window.auth?.currentUser) return;
    const module = moduleFromPath(path);
    const actor = identity || await resolveIdentity();
    const payload = {
      action,
      actionLabel: actionLabels[action] || action,
      module,
      entityPath: path || null,
      entityId: entityIdFromPath(path),
      description: description || describeMutation(path, data, action),
      actor,
      createdAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      clientCreatedAt: new Date().toISOString(),
      userAgent: String(navigator.userAgent || '').slice(0, 300)
    };

    try {
      const collection = window.db.collection(AUDIT_COLLECTION);
      await state.originals.collectionAdd.call(collection, payload);
    } catch (error) {
      console.warn('Auditoría: no se pudo guardar el evento:', error?.message || error);
    }
  }

  function shouldAuditPath(path) {
    if (!isAdminSession()) return false;
    const collection = String(path || '').split('/')[0];
    return Boolean(collection && ![AUDIT_COLLECTION, '__audit_probe__'].includes(collection));
  }

  function normalizeUpdateData(args) {
    if (args.length === 1 && args[0] && typeof args[0] === 'object') return args[0];
    const result = {};
    for (let index = 0; index < args.length; index += 2) {
      const field = args[index];
      if (typeof field === 'string') result[field] = args[index + 1];
    }
    return result;
  }

  function patchFirestoreWrites() {
    if (state.firestorePatched || !window.db) return;
    const sampleCollection = window.db.collection('__audit_probe__');
    const sampleDocument = sampleCollection.doc('__probe__');
    const collectionPrototype = Object.getPrototypeOf(sampleCollection);
    const documentPrototype = Object.getPrototypeOf(sampleDocument);

    const originals = {
      collectionAdd: collectionPrototype.add,
      documentSet: documentPrototype.set,
      documentUpdate: documentPrototype.update,
      documentDelete: documentPrototype.delete,
      runTransaction: window.db.runTransaction.bind(window.db),
      batch: window.db.batch.bind(window.db)
    };
    state.originals = originals;

    collectionPrototype.add = async function auditedAdd(data) {
      const result = await originals.collectionAdd.call(this, data);
      if (shouldAuditPath(this.path)) {
        void writeAudit({ action: 'create', path: `${this.path}/${result.id}`, data });
      }
      return result;
    };

    documentPrototype.set = async function auditedSet(data, options) {
      const result = options === undefined
        ? await originals.documentSet.call(this, data)
        : await originals.documentSet.call(this, data, options);
      if (shouldAuditPath(this.path)) void writeAudit({ action: 'set', path: this.path, data });
      return result;
    };

    documentPrototype.update = async function auditedUpdate(...args) {
      const result = await originals.documentUpdate.apply(this, args);
      if (shouldAuditPath(this.path)) {
        void writeAudit({ action: 'update', path: this.path, data: normalizeUpdateData(args) });
      }
      return result;
    };

    documentPrototype.delete = async function auditedDelete() {
      const path = this.path;
      const result = await originals.documentDelete.call(this);
      if (shouldAuditPath(path)) void writeAudit({ action: 'delete', path });
      return result;
    };

    window.db.runTransaction = function auditedTransaction(updateFunction, options) {
      const actions = [];
      const wrappedUpdate = transaction => {
        const proxy = new Proxy(transaction, {
          get(target, property) {
            if (property === 'set') return (reference, data, setOptions) => {
              actions.push({ action: 'set', path: reference.path, data });
              target.set(reference, data, setOptions);
              return proxy;
            };
            if (property === 'update') return (reference, ...args) => {
              actions.push({ action: 'update', path: reference.path, data: normalizeUpdateData(args) });
              target.update(reference, ...args);
              return proxy;
            };
            if (property === 'delete') return reference => {
              actions.push({ action: 'delete', path: reference.path, data: null });
              target.delete(reference);
              return proxy;
            };
            const value = target[property];
            return typeof value === 'function' ? value.bind(target) : value;
          }
        });
        return updateFunction(proxy);
      };
      return originals.runTransaction(wrappedUpdate, options).then(result => {
        actions.filter(item => shouldAuditPath(item.path)).forEach(item => void writeAudit(item));
        return result;
      });
    };

    window.db.batch = function auditedBatch() {
      const batch = originals.batch();
      const actions = [];
      const proxy = new Proxy(batch, {
        get(target, property) {
          if (property === 'set') return (reference, data, options) => {
            actions.push({ action: 'set', path: reference.path, data });
            target.set(reference, data, options);
            return proxy;
          };
          if (property === 'update') return (reference, ...args) => {
            actions.push({ action: 'update', path: reference.path, data: normalizeUpdateData(args) });
            target.update(reference, ...args);
            return proxy;
          };
          if (property === 'delete') return reference => {
            actions.push({ action: 'delete', path: reference.path, data: null });
            target.delete(reference);
            return proxy;
          };
          if (property === 'commit') return async () => {
            const result = await target.commit();
            actions.filter(item => shouldAuditPath(item.path)).forEach(item => void writeAudit(item));
            return result;
          };
          const value = target[property];
          return typeof value === 'function' ? value.bind(target) : value;
        }
      });
      return proxy;
    };

    state.firestorePatched = true;
  }

  function periodStart(period, now = new Date()) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    if (period === 'week') {
      const day = start.getDay();
      const diff = day === 0 ? 6 : day - 1;
      start.setDate(start.getDate() - diff);
    } else if (period === 'month') {
      start.setDate(1);
    }
    return start;
  }

  function logDate(log) {
    if (log.createdAt?.toDate) return log.createdAt.toDate();
    if (log.clientCreatedAt) return new Date(log.clientCreatedAt);
    return new Date(0);
  }

  function filteredLogs() {
    const start = periodStart(state.period);
    return state.logs.filter(log => logDate(log) >= start);
  }

  function formatDate(date) {
    return date.toLocaleString('es-PE', {
      timeZone: 'America/Lima',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }

  function badgeClass(action) {
    return {
      create: 'success', set: 'primary', update: 'warning', delete: 'danger',
      login: 'info', logout: 'secondary'
    }[action] || 'secondary';
  }

  function render() {
    const body = document.getElementById('auditTableBody');
    if (!body) return;
    const logs = filteredLogs();
    document.getElementById('auditTotalCount').textContent = String(logs.length);
    document.getElementById('auditPeopleCount').textContent = String(new Set(logs.map(log => log.actor?.phone || log.actor?.uid || log.actor?.name).filter(Boolean)).size);
    document.getElementById('auditModuleCount').textContent = String(new Set(logs.map(log => log.module).filter(Boolean)).size);

    document.querySelectorAll('[data-audit-period]').forEach(button => {
      const active = button.dataset.auditPeriod === state.period;
      button.classList.toggle('btn-primary', active);
      button.classList.toggle('btn-outline-secondary', !active);
      button.classList.toggle('active', active);
    });

    if (!logs.length) {
      body.innerHTML = '<tr><td colspan="6"><div class="audit-empty d-flex flex-column align-items-center justify-content-center text-muted"><i class="bi bi-shield-check display-5 mb-2"></i><p class="mb-0">No existen registros en este período.</p></div></td></tr>';
      return;
    }

    body.innerHTML = logs.map(log => {
      const actor = log.actor || {};
      return `<tr>
        <td class="text-nowrap">${esc(formatDate(logDate(log)))}</td>
        <td class="audit-person"><strong>${esc(actor.name || 'Administrador')}</strong><br><small class="text-muted">${esc(actor.phone || actor.role || '')}</small></td>
        <td><span class="badge text-bg-${badgeClass(log.action)}">${esc(log.actionLabel || actionLabels[log.action] || log.action || 'Acción')}</span></td>
        <td>${esc(log.module || 'Sistema')}</td>
        <td class="audit-detail">${esc(log.description || '')}</td>
        <td class="font-monospace small">${esc(log.entityId || '—')}</td>
      </tr>`;
    }).join('');
  }

  function setPeriod(period) {
    state.period = ['day', 'week', 'month'].includes(period) ? period : 'day';
    render();
  }

  function subscribe() {
    if (state.unsubscribe || !window.db) return;
    state.unsubscribe = window.db.collection(AUDIT_COLLECTION)
      .orderBy('createdAt', 'desc')
      .limit(MAX_VISIBLE_LOGS)
      .onSnapshot(snapshot => {
        state.logs = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
        render();
      }, error => {
        console.error('Auditoría:', error);
        toast(error?.code === 'permission-denied'
          ? 'Sin permiso para leer Auditoría. Verifica la cuenta, config/admin y despliega las reglas.'
          : `No se pudo cargar Auditoría: ${error.message}`, 'danger');
      });
  }

  function ensureNavigation() {
    const sidebar = document.querySelector('.admin-sidebar');
    if (!sidebar || sidebar.querySelector('[data-admin-section="auditoria"]')) return;
    const link = document.createElement('a');
    link.href = '#';
    link.className = 'nav-link';
    link.dataset.adminSection = 'auditoria';
    link.innerHTML = '<i class="bi bi-shield-check"></i> Auditoría';
    const appearance = sidebar.querySelector('[data-admin-section="apariencia"]');
    if (appearance) sidebar.insertBefore(link, appearance);
    else sidebar.querySelector('.mt-auto')?.before(link) || sidebar.append(link);
  }

  function ensureSection() {
    if (document.getElementById('sec-auditoria')) return;
    const content = document.querySelector('.admin-content');
    if (!content) return;
    const section = document.createElement('div');
    section.className = 'admin-section';
    section.id = 'sec-auditoria';
    section.innerHTML = `
      <div class="audit-toolbar d-flex align-items-center justify-content-between gap-3 flex-wrap mb-4">
        <div>
          <h2 class="section-title mb-1"><i class="bi bi-shield-check me-2"></i>Auditoría</h2>
          <p class="text-muted small mb-0">Registro del personal y de las modificaciones administrativas.</p>
        </div>
        <div class="d-flex gap-2 flex-wrap audit-actions">
          <div class="btn-group" role="group" aria-label="Período de auditoría">
            <button type="button" class="btn btn-primary btn-sm active" data-audit-period="day">Hoy</button>
            <button type="button" class="btn btn-outline-secondary btn-sm" data-audit-period="week">Semana</button>
            <button type="button" class="btn btn-outline-secondary btn-sm" data-audit-period="month">Mes</button>
          </div>
          <button type="button" class="btn btn-outline-secondary btn-sm" id="auditRefreshBtn"><i class="bi bi-arrow-clockwise me-1"></i>Actualizar</button>
          <button type="button" class="btn btn-danger btn-sm" id="auditPdfBtn"><i class="bi bi-file-earmark-pdf me-1"></i>Descargar PDF</button>
        </div>
      </div>
      <div class="row g-3 mb-4">
        <div class="col-12 col-sm-4"><div class="card audit-summary-card"><div class="card-body"><small class="text-muted">Eventos</small><div class="audit-value mt-2" id="auditTotalCount">0</div></div></div></div>
        <div class="col-12 col-sm-4"><div class="card audit-summary-card"><div class="card-body"><small class="text-muted">Personal identificado</small><div class="audit-value mt-2" id="auditPeopleCount">0</div></div></div></div>
        <div class="col-12 col-sm-4"><div class="card audit-summary-card"><div class="card-body"><small class="text-muted">Módulos modificados</small><div class="audit-value mt-2" id="auditModuleCount">0</div></div></div></div>
      </div>
      <div class="card">
        <div class="table-responsive">
          <table class="table table-hover mb-0 audit-table">
            <thead class="table-dark"><tr><th>Fecha</th><th>Personal</th><th>Acción</th><th>Módulo</th><th>Detalle</th><th>Registro</th></tr></thead>
            <tbody id="auditTableBody"><tr><td colspan="6" class="text-center py-5 text-muted"><span class="spinner-border spinner-border-sm me-2"></span>Cargando auditoría…</td></tr></tbody>
          </table>
        </div>
      </div>`;
    const appearance = document.getElementById('sec-apariencia');
    if (appearance) content.insertBefore(section, appearance);
    else content.append(section);
  }

  function activateSection(event) {
    event?.preventDefault();
    document.querySelectorAll('[data-admin-section]').forEach(item => item.classList.toggle('active', item.dataset.adminSection === 'auditoria'));
    document.querySelectorAll('.admin-section').forEach(item => item.classList.toggle('active', item.id === 'sec-auditoria'));
    subscribe();
  }

  function bindUi() {
    document.querySelector('.admin-sidebar [data-admin-section="auditoria"]')?.addEventListener('click', activateSection);
    document.querySelectorAll('[data-audit-period]').forEach(button => button.addEventListener('click', () => setPeriod(button.dataset.auditPeriod)));
    document.getElementById('auditRefreshBtn')?.addEventListener('click', () => {
      state.unsubscribe?.();
      state.unsubscribe = null;
      subscribe();
    });
    document.getElementById('auditPdfBtn')?.addEventListener('click', downloadPdf);
  }

  function pdfPeriodLabel() {
    return { day: 'Hoy', week: 'Semana actual', month: 'Mes actual' }[state.period] || 'Período';
  }

  function pdfFilename() {
    const date = new Date().toISOString().slice(0, 10);
    return `auditoria-${state.period}-${date}.pdf`;
  }

  function drawPdfHeader(doc, pageNumber, total) {
    const storeName = document.querySelector('.logo-text')?.textContent?.trim() || 'Kiosco';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(`${storeName} - Auditoría`, 14, 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Período: ${pdfPeriodLabel()} | Registros: ${total} | Página: ${pageNumber}`, 14, 21);
    doc.text(`Generado: ${formatDate(new Date())}`, 14, 26);
    doc.setDrawColor(160);
    doc.line(14, 29, 283, 29);
  }

  function downloadPdf() {
    const logs = filteredLogs();
    if (!logs.length) return toast('No hay registros para exportar en este período', 'warning');
    const JsPdf = window.jspdf?.jsPDF;
    if (!JsPdf) return toast('No se pudo cargar el generador de PDF. Verifica tu conexión.', 'danger');

    const doc = new JsPdf({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const columns = [
      { title: 'Fecha', x: 14, width: 34 },
      { title: 'Personal', x: 49, width: 43 },
      { title: 'Acción', x: 93, width: 30 },
      { title: 'Módulo', x: 124, width: 36 },
      { title: 'Detalle', x: 161, width: 104 },
      { title: 'Registro', x: 266, width: 17 }
    ];
    const marginBottom = 198;
    let pageNumber = 1;
    let y = 36;

    const drawTableHeader = () => {
      doc.setFillColor(35, 35, 42);
      doc.rect(14, y - 5, 269, 8, 'F');
      doc.setTextColor(255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      columns.forEach(column => doc.text(column.title, column.x + 1, y));
      doc.setTextColor(0);
      doc.setFont('helvetica', 'normal');
      y += 6;
    };

    drawPdfHeader(doc, pageNumber, logs.length);
    drawTableHeader();

    logs.forEach(log => {
      const actor = log.actor || {};
      const values = [
        formatDate(logDate(log)),
        `${actor.name || 'Administrador'}${actor.phone ? `\n${actor.phone}` : ''}`,
        log.actionLabel || actionLabels[log.action] || log.action || '',
        log.module || 'Sistema',
        log.description || '',
        log.entityId || '—'
      ];
      const wrapped = values.map((value, index) => doc.splitTextToSize(String(value), columns[index].width - 2));
      const rowHeight = Math.max(7, ...wrapped.map(lines => lines.length * 4 + 2));
      if (y + rowHeight > marginBottom) {
        doc.addPage('a4', 'landscape');
        pageNumber += 1;
        y = 36;
        drawPdfHeader(doc, pageNumber, logs.length);
        drawTableHeader();
      }
      doc.setDrawColor(210);
      doc.rect(14, y - 4, 269, rowHeight);
      doc.setFontSize(7.5);
      wrapped.forEach((lines, index) => doc.text(lines, columns[index].x + 1, y));
      y += rowHeight;
    });

    doc.save(pdfFilename());
    toast('PDF de auditoría descargado', 'success');
  }

  function bindSessionEvents() {
    window.auth?.onAuthStateChanged(async user => {
      if (!user || localStorage.getItem('kk_role') !== 'admin') {
        sessionStorage.removeItem(SESSION_LOGIN_KEY);
        return;
      }
      if (sessionStorage.getItem(SESSION_LOGIN_KEY)) return;
      sessionStorage.setItem(SESSION_LOGIN_KEY, 'true');
      const identity = await resolveIdentity(user);
      void writeAudit({ action: 'login', path: 'config/session', description: 'Inicio de sesión en el panel administrativo', identity });
    });

    ['logoutAdminBtn', 'logoutAdminBtn2', 'logoutAdminMobileBtn'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', () => {
        const user = window.auth?.currentUser;
        if (!user) return;
        void resolveIdentity(user).then(identity => writeAudit({
          action: 'logout',
          path: 'config/session',
          description: 'Cierre de sesión del panel administrativo',
          identity
        }));
      }, { capture: true });
    });
  }

  function init() {
    if (state.initialized) return;
    if (!window.db || !window.firebase || !window.auth) {
      window.setTimeout(init, 150);
      return;
    }
    state.initialized = true;
    patchFirestoreWrites();
    ensureNavigation();
    ensureSection();
    bindUi();
    bindSessionEvents();
  }

  window.KioscoAudit = Object.freeze({
    init,
    log(action, module, description, entityId = null) {
      const path = `${String(module || 'system').replace(/\s+/g, '_').toLowerCase()}/${entityId || 'manual'}`;
      return writeAudit({ action, path, description });
    },
    refresh() {
      state.unsubscribe?.();
      state.unsubscribe = null;
      subscribe();
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
