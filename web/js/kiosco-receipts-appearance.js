'use strict';

(() => {
  const UPGRADE_CONFIG = Object.assign({ apiBaseUrl: '' }, window.KIOSCO_UPGRADE_CONFIG || {});
  const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
  const COMPATIBLE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'avif', 'bmp', 'ico', 'heic', 'heif', 'tif', 'tiff', 'jxl']);
  const state = {
    theme: {},
    billing: {},
    logoFile: null,
    logoPreviewUrl: null,
    receiptsUnsubscribe: null,
    proofsUnsubscribe: null,
    publicUnsubscribe: null,
    receiptPeriod: 'today',
    adminOrders: [],
    paymentProofs: new Map()
  };

  function html(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function toast(message, type = 'info') {
    if (typeof window.showToast === 'function') window.showToast(message, type);
    else console.info(`[Kiosco:${type}]`, message);
  }

  function apiBaseUrl() {
    const value = String(UPGRADE_CONFIG.apiBaseUrl || "").trim().replace(/\/$/, "");
    return /^https:\/\//i.test(value) && !value.includes("REEMPLAZAR") ? value : "";
  }

  function localReceiptUrl(order, autoPrint = false) {
    const token = order?.billing?.publicToken;
    if (!order?.id || !token) return "";
    const url = new URL("/", String(UPGRADE_CONFIG.storeUrl || location.origin));
    url.hash = "";
    url.search = "";
    url.searchParams.set("receiptOrder", order.id);
    url.searchParams.set("receiptToken", token);
    if (autoPrint) url.searchParams.set("print", "1");
    return url.href;
  }

  function publicReceiptUrl(order, autoPrint = false) {
    const token = order?.billing?.publicToken;
    if (!order?.id || !token) return "";
    const base = apiBaseUrl();
    if (base) return base + "/api/boleta?orderId=" + encodeURIComponent(order.id) + "&token=" + encodeURIComponent(token);
    return localReceiptUrl(order, autoPrint);
  }

  const RECEIPT_RETURN_KEY = 'kioscoReceiptReturnUrl';

  function rememberReceiptReturnUrl() {
    sessionStorage.setItem(RECEIPT_RETURN_KEY, location.href);
  }

  function returnFromReceipt() {
    const returnUrl = sessionStorage.getItem(RECEIPT_RETURN_KEY);
    sessionStorage.removeItem(RECEIPT_RETURN_KEY);

    if (returnUrl) {
      try {
        const parsed = new URL(returnUrl, location.origin);
        if (parsed.origin === location.origin) {
          location.assign(parsed.href);
          return;
        }
      } catch { /* ignore invalid stored URL */ }
    }

    if (history.length > 1) {
      history.back();
      return;
    }

    location.assign(new URL('/', String(UPGRADE_CONFIG.storeUrl || location.origin)).href);
  }
  async function adminApi(path, options = {}) {
    const base = apiBaseUrl();
    if (!base) throw new Error('Configura apiBaseUrl en js/kiosco-upgrade-config.js');
    const user = window.auth?.currentUser;
    if (!user) throw new Error('Inicia sesión como administrador');
    const response = await fetch(`${base}${path}`, {
      method: options.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await user.getIdToken()}`
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try { message = (await response.json()).error || message; } catch { /* ignore */ }
      throw new Error(message);
    }
    return response;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.target = '_blank';
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function sanitizeFileName(name) {
    return String(name || 'imagen')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .replace(/-+/g, '-')
      .toLowerCase();
  }

  async function normalizeImage(file) {
    if (!file || file.size === 0) throw new Error('Selecciona una imagen válida');
    if (file.size > MAX_IMAGE_SIZE) throw new Error('La imagen original no debe superar 10 MB');
    const extension = String(file.name || '').split('.').pop()?.toLowerCase() || '';
    const mime = String(file.type || '').toLowerCase();
    if (!mime.startsWith('image/') && !COMPATIBLE_EXTENSIONS.has(extension)) throw new Error('El archivo seleccionado no es una imagen compatible');
    if (extension === 'svg' || mime === 'image/svg+xml') {
      const source = await file.text();
      if (!/<svg[\s>]/i.test(source) || /<script[\s>]/i.test(source) || /\son[a-z]+\s*=/i.test(source)) throw new Error('El SVG contiene código no permitido');
    }
    return file;
  }

  async function uploadLogo(file) {
    if (!window.auth?.currentUser) throw new Error('Solo el administrador puede subir imágenes');
    if (!window.KioscoMedia?.upload) throw new Error('El módulo de imágenes no está disponible. Recarga la aplicación.');
    const normalized = await normalizeImage(file);
    const asset = await window.KioscoMedia.upload(normalized, {
      scope: 'branding',
      entityId: 'logo',
      maxBytes: MAX_IMAGE_SIZE
    });
    return { path: asset.path, url: asset.url, pendingDeploy: asset.pendingDeploy };
  }
  async function deleteStorageFile(path) {
    if (!path) return;
    if (window.KioscoMedia?.isRepositoryPath?.(path)) {
      try { await window.KioscoMedia.remove(path); }
      catch (error) { console.warn('Logo del repositorio:', error?.message || error); }
      return;
    }
    if (window.KioscoMedia?.isCloudinaryPath?.(path) || String(path).startsWith('cloudinary:')) return;
    if (!window.storage) return;
    try { await window.storage.ref(path).delete(); }
    catch (error) { if (error?.code !== 'storage/object-not-found') console.warn('Logo anterior:', error); }
  }

  function applyLiveTheme(theme) {
    if (theme.storeName) {
      document.querySelectorAll('.logo-text').forEach(element => { element.textContent = theme.storeName; });
      document.title = theme.storeName;
      if (window.APP_CONFIG) window.APP_CONFIG.storeName = theme.storeName;
    }
    if (/^#[0-9a-f]{6}$/i.test(String(theme.accentColor || ''))) {
      const color = theme.accentColor;
      const rgb = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16)).join(',');
      document.documentElement.style.setProperty('--accent', color);
      document.documentElement.style.setProperty('--accent-rgb', rgb);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
    }
    document.querySelectorAll('.logo-icon').forEach(element => {
      if (theme.storeLogoUrl) {
        element.innerHTML = `<img src="${html(theme.storeLogoUrl)}" alt="Logo" class="kiosk-live-logo">`;
      } else {
        element.textContent = theme.storeEmoji || '🛍️';
      }
    });
  }

  function createAppearanceUpgrade() {
    const section = document.getElementById('sec-apariencia');
    if (!section || document.getElementById('kioskAppearanceUpgrade')) return;
    const legacy = document.getElementById('brandingForm')?.closest('.card');
    if (legacy) legacy.hidden = true;

    const wrapper = document.createElement('div');
    wrapper.id = 'kioskAppearanceUpgrade';
    wrapper.innerHTML = `
      <div class="row g-3">
        <div class="col-xl-7">
          <div class="card h-100">
            <div class="card-header fw-bold"><i class="bi bi-shop me-2"></i>Identidad pública</div>
            <div class="card-body">
              <div class="row g-3">
                <div class="col-md-7"><label class="form-label fw-semibold">Nombre de la tienda</label><input id="kBrandName" class="form-control" maxlength="60"></div>
                <div class="col-md-5"><label class="form-label fw-semibold">Texto corto</label><input id="kBrandTagline" class="form-control" maxlength="90" placeholder="Productos actualizados en tiempo real"></div>
                <div class="col-md-4"><label class="form-label fw-semibold">Color principal</label><input id="kBrandColor" type="color" class="form-control form-control-color w-100"></div>
                <div class="col-md-4"><label class="form-label fw-semibold">Emoji alternativo</label><input id="kBrandEmoji" class="form-control" maxlength="8" placeholder="🛍️"></div>
                <div class="col-md-4"><label class="form-label fw-semibold">ETA (min)</label><input id="kBrandEta" type="number" min="1" max="180" class="form-control"></div>
                <div class="col-12">
                  <label class="form-label fw-semibold">Logo desde el dispositivo</label>
                  <input id="kBrandLogoFile" type="file" class="form-control" accept="image/*,.svg,.avif,.heic,.heif,.tif,.tiff,.bmp,.ico,.jxl">
                  <div class="form-text">Selecciona el logo desde este dispositivo. Kiosco lo optimiza y lo guarda en web/uploads/branding del repositorio. Máximo original: 10 MB.</div>
                </div>
                <div class="col-12"><label class="form-label fw-semibold">URL alternativa del logo</label><input id="kBrandLogoUrl" type="url" class="form-control" placeholder="https://..."></div>
                <div class="col-12 d-flex gap-2 flex-wrap">
                  <button id="kSaveAppearance" class="btn btn-primary" type="button"><i class="bi bi-cloud-arrow-up me-2"></i>Guardar y publicar</button>
                  <button id="kRemoveLogo" class="btn btn-outline-danger" type="button"><i class="bi bi-trash me-2"></i>Quitar logo</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-xl-5">
          <div class="card h-100">
            <div class="card-header fw-bold"><i class="bi bi-phone me-2"></i>Vista pública en tiempo real</div>
            <div class="card-body d-flex align-items-center justify-content-center">
              <div class="kiosk-brand-preview">
                <div id="kBrandPreviewLogo" class="kiosk-brand-preview-logo">🛍️</div>
                <div id="kBrandPreviewName" class="kiosk-brand-preview-name">Kiosco</div>
                <div id="kBrandPreviewTagline" class="kiosk-brand-preview-tagline">Productos actualizados en tiempo real.</div>
                <button id="kBrandPreviewButton" type="button" disabled>Agregar al carrito</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="card mt-3">
        <div class="card-header fw-bold"><i class="bi bi-receipt-cutoff me-2"></i>Datos del recibo</div>
        <div class="card-body">
          <div class="row g-3">
            <div class="col-md-6"><label class="form-label fw-semibold">Razón social / negocio</label><input id="kBillingName" class="form-control" maxlength="120"></div>
            <div class="col-md-3"><label class="form-label fw-semibold">RUC</label><input id="kBillingRuc" class="form-control" inputmode="numeric" maxlength="11"></div>
            <div class="col-md-3"><label class="form-label fw-semibold">Serie</label><input id="kBillingSeries" class="form-control text-uppercase" maxlength="10" placeholder="B001"></div>
            <div class="col-md-6"><label class="form-label fw-semibold">Dirección</label><input id="kBillingAddress" class="form-control" maxlength="180"></div>
            <div class="col-md-3"><label class="form-label fw-semibold">Teléfono</label><input id="kBillingPhone" class="form-control" maxlength="30"></div>
            <div class="col-md-3"><label class="form-label fw-semibold">Correo</label><input id="kBillingEmail" type="email" class="form-control" maxlength="120"></div>
            <div class="col-md-6"><label class="form-label fw-semibold">Título del documento</label><input id="kBillingTitle" class="form-control" maxlength="40" placeholder="RECIBO DE VENTA"></div>
            <div class="col-md-3"><label class="form-label fw-semibold">Siguiente número</label><input id="kBillingNext" type="number" min="1" class="form-control"></div>
            <div class="col-md-3 d-flex align-items-end"><div class="form-check form-switch mb-2"><input id="kBillingIgv" class="form-check-input" type="checkbox" checked><label class="form-check-label" for="kBillingIgv">Total incluye IGV 18%</label></div></div>
            <div class="col-12"><button id="kSaveBilling" class="btn btn-primary" type="button"><i class="bi bi-save me-2"></i>Guardar datos del recibo</button></div>
          </div>
        </div>
      </div>`;
    section.appendChild(wrapper);

    document.getElementById('kBrandLogoFile')?.addEventListener('change', async event => {
      const file = event.target.files?.[0] || null;
      state.logoFile = null;
      if (state.logoPreviewUrl) URL.revokeObjectURL(state.logoPreviewUrl);
      state.logoPreviewUrl = null;
      if (!file) return renderAppearance();
      try {
        const normalized = await normalizeImage(file);
        state.logoFile = normalized;
        state.logoPreviewUrl = URL.createObjectURL(normalized);
        renderAppearancePreview();
      } catch (error) {
        event.target.value = '';
        toast(error.message, 'danger');
      }
    });
    ['kBrandName', 'kBrandTagline', 'kBrandColor', 'kBrandEmoji', 'kBrandLogoUrl'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', renderAppearancePreview);
    });
    document.getElementById('kSaveAppearance')?.addEventListener('click', saveAppearance);
    document.getElementById('kRemoveLogo')?.addEventListener('click', removeLogo);
    document.getElementById('kSaveBilling')?.addEventListener('click', saveBilling);
  }

  function setValue(id, value) {
    const element = document.getElementById(id);
    if (element) element.value = value ?? '';
  }

  function renderAppearance() {
    createAppearanceUpgrade();
    const theme = state.theme || {};
    const billing = state.billing || {};
    setValue('kBrandName', theme.storeName || 'Kiosco');
    setValue('kBrandTagline', theme.storeTagline || 'Productos actualizados en tiempo real.');
    setValue('kBrandColor', theme.accentColor || '#f97316');
    setValue('kBrandEmoji', theme.storeEmoji || '🛍️');
    setValue('kBrandEta', theme.etaMinutes || 30);
    setValue('kBrandLogoUrl', theme.storeLogoUrl || '');
    setValue('kBillingName', billing.businessName || theme.storeName || 'Kiosco');
    setValue('kBillingRuc', billing.ruc || '');
    setValue('kBillingSeries', billing.series || 'B001');
    setValue('kBillingAddress', billing.address || '');
    setValue('kBillingPhone', billing.phone || '');
    setValue('kBillingEmail', billing.email || '');
    setValue('kBillingTitle', billing.documentTitle || 'RECIBO DE VENTA');
    setValue('kBillingNext', billing.nextNumber || 1);
    const igv = document.getElementById('kBillingIgv');
    if (igv) igv.checked = billing.includesIgv !== false;
    renderAppearancePreview();
  }

  function renderAppearancePreview() {
    const name = document.getElementById('kBrandName')?.value.trim() || 'Kiosco';
    const tagline = document.getElementById('kBrandTagline')?.value.trim() || 'Productos actualizados en tiempo real.';
    const emoji = document.getElementById('kBrandEmoji')?.value.trim() || '🛍️';
    const url = state.logoPreviewUrl || document.getElementById('kBrandLogoUrl')?.value.trim() || state.theme.storeLogoUrl;
    const color = document.getElementById('kBrandColor')?.value || '#f97316';
    document.getElementById('kBrandPreviewName').textContent = name;
    document.getElementById('kBrandPreviewTagline').textContent = tagline;
    const logo = document.getElementById('kBrandPreviewLogo');
    if (logo) logo.innerHTML = url ? `<img src="${html(url)}" alt="Vista previa">` : html(emoji);
    const button = document.getElementById('kBrandPreviewButton');
    if (button) button.style.background = color;
  }

  async function saveAppearance() {
    const button = document.getElementById('kSaveAppearance');
    const originalButtonHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Publicando';
    const previousPath = state.theme.storeLogoPath || null;
    let uploaded = null;
    try {
      if (state.logoFile) uploaded = await uploadLogo(state.logoFile);
      const typedUrl = document.getElementById('kBrandLogoUrl')?.value.trim() || '';
      const changes = {
        storeName: document.getElementById('kBrandName')?.value.trim() || 'Kiosco',
        storeTagline: document.getElementById('kBrandTagline')?.value.trim() || '',
        accentColor: document.getElementById('kBrandColor')?.value || '#f97316',
        storeEmoji: document.getElementById('kBrandEmoji')?.value.trim() || '🛍️',
        etaMinutes: Math.max(1, Number(document.getElementById('kBrandEta')?.value || 30)),
        storeLogoUrl: uploaded?.url || typedUrl || state.theme.storeLogoUrl || null,
        storeLogoPath: uploaded?.path || (typedUrl ? null : state.theme.storeLogoPath || null),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      await db.collection(COLL.config).doc('theme').set(changes, { merge: true });
      if ((uploaded || typedUrl) && previousPath && previousPath !== uploaded?.path) {
        await deleteStorageFile(previousPath);
      }
      state.logoFile = null;
      if (state.logoPreviewUrl) URL.revokeObjectURL(state.logoPreviewUrl);
      state.logoPreviewUrl = null;
      const fileInput = document.getElementById('kBrandLogoFile');
      if (fileInput) fileInput.value = '';
      applyLiveTheme({ ...state.theme, ...changes });
      toast(uploaded?.pendingDeploy ? 'Apariencia guardada. El nuevo logo se publicará al completar Firebase Hosting.' : 'Apariencia publicada en tiempo real', 'success');
    } catch (error) {
      if (uploaded?.path) await deleteStorageFile(uploaded.path);
      toast(error.message, 'danger');
    } finally {
      button.disabled = false;
    }
  }

  async function removeLogo() {
    if (!confirm('¿Quitar el logo actual?')) return;
    const previousPath = state.theme.storeLogoPath || null;
    try {
      await db.collection(COLL.config).doc('theme').set({
        storeLogoUrl: null,
        storeLogoPath: null,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      await deleteStorageFile(previousPath);
      toast('Logo eliminado', 'success');
    } catch (error) { toast(error.message, 'danger'); }
  }

  async function saveBilling() {
    const ruc = document.getElementById('kBillingRuc')?.value.replace(/\D/g, '') || '';
    if (ruc && ruc.length !== 11) return toast('El RUC debe tener 11 dígitos', 'danger');
    const data = {
      businessName: document.getElementById('kBillingName')?.value.trim() || state.theme.storeName || 'Kiosco',
      ruc,
      series: (document.getElementById('kBillingSeries')?.value || 'B001').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 10),
      address: document.getElementById('kBillingAddress')?.value.trim() || '',
      phone: document.getElementById('kBillingPhone')?.value.trim() || '',
      email: document.getElementById('kBillingEmail')?.value.trim() || '',
      documentTitle: document.getElementById('kBillingTitle')?.value.trim() || 'RECIBO DE VENTA',
      nextNumber: Math.max(1, Math.trunc(Number(document.getElementById('kBillingNext')?.value || 1))),
      includesIgv: document.getElementById('kBillingIgv')?.checked !== false,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    try {
      await db.collection(COLL.config).doc('billing').set(data, { merge: true });
      toast('Datos del recibo guardados', 'success');
    } catch (error) { toast(error.message, 'danger'); }
  }

  function openAdminSection(sectionName) {
    document.querySelectorAll('[data-admin-section]').forEach(element => element.classList.toggle('active', element.dataset.adminSection === sectionName));
    document.querySelectorAll('.admin-section').forEach(element => element.classList.toggle('active', element.id === `sec-${sectionName}`));
    if (sectionName === 'receipts') startAdminReceipts();
  }

  function createReceiptsSection() {
    if (document.getElementById('sec-receipts')) return;
    const appearanceLink = document.querySelector('.admin-sidebar [data-admin-section="apariencia"]');
    const link = document.createElement('a');
    link.href = '#';
    link.className = 'nav-link';
    link.dataset.adminSection = 'receipts';
    link.innerHTML = '<i class="bi bi-receipt-cutoff"></i> Recibos';
    appearanceLink?.parentElement?.insertBefore(link, appearanceLink);
    link.addEventListener('click', event => { event.preventDefault(); openAdminSection('receipts'); });

    const mobile = document.getElementById('adminNavMobile');
    if (mobile && !mobile.querySelector('[data-admin-section="receipts"]')) {
      const mobileLink = link.cloneNode(true);
      mobileLink.addEventListener('click', event => {
        event.preventDefault();
        bootstrap.Offcanvas.getInstance(document.getElementById('adminOffcanvas'))?.hide();
        openAdminSection('receipts');
      });
      mobile.appendChild(mobileLink);
    }

    const section = document.createElement('div');
    section.className = 'admin-section';
    section.id = 'sec-receipts';
    section.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3 gap-2 flex-wrap">
        <div><h2 class="section-title mb-1"><i class="bi bi-receipt-cutoff me-2"></i>Recibos</h2><p class="text-muted small mb-0">Emite, visualiza, imprime y comparte recibos con el cliente.</p></div>
        <div class="d-flex gap-2 flex-wrap align-items-center">
          <div class="btn-group btn-group-sm kiosk-receipt-filters" role="group" aria-label="Periodo de recibos">
            <button type="button" class="btn btn-outline-secondary active" data-receipt-period="today">Hoy</button>
            <button type="button" class="btn btn-outline-secondary" data-receipt-period="week">Semana</button>
            <button type="button" class="btn btn-outline-secondary" data-receipt-period="month">Mes</button>
          </div>
          <button id="kRefreshReceipts" class="btn btn-outline-secondary btn-sm"><i class="bi bi-arrow-clockwise me-1"></i>Actualizar</button>
        </div>
      </div>
      <div id="kReceiptPeriodSummary" class="text-muted small mb-2"></div>
      <div class="card"><div class="table-responsive"><table class="table table-hover align-middle mb-0">
        <thead><tr><th>Pedido</th><th>Cliente</th><th>Fecha</th><th>Total</th><th>Estado</th><th>Pago</th><th>Recibo</th><th>Acciones</th></tr></thead>
        <tbody id="kReceiptsBody"><tr><td colspan="8" class="text-center text-muted py-4">Cargando…</td></tr></tbody>
      </table></div></div>`;
    document.querySelector('.admin-content')?.appendChild(section);
    document.getElementById('kRefreshReceipts')?.addEventListener('click', startAdminReceipts);
    section.querySelectorAll('[data-receipt-period]').forEach(button => button.addEventListener('click', () => {
      state.receiptPeriod = button.dataset.receiptPeriod;
      section.querySelectorAll('[data-receipt-period]').forEach(item => item.classList.toggle('active', item === button));
      renderAdminReceipts(state.adminOrders);
    }));
  }

  function receiptStatus(order) {
    return order.billing?.publicToken
      ? `<span class="badge text-bg-success">Emitido ${html(order.billing.series || '')}-${String(order.billing.number || '').padStart(8, '0')}</span>`
      : '<span class="badge text-bg-secondary">Pendiente</span>';
  }

  function limaParts(date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
  }

  function periodMatches(order, period) {
    const date = order.createdAt?.toDate?.();
    if (!date) return false;
    const now = new Date();
    const current = limaParts(now);
    const value = limaParts(date);
    if (period === 'today') return value.year === current.year && value.month === current.month && value.day === current.day;
    if (period === 'month') return value.year === current.year && value.month === current.month;
    const todayUtc = Date.UTC(current.year, current.month - 1, current.day);
    const valueUtc = Date.UTC(value.year, value.month - 1, value.day);
    const weekday = new Date(todayUtc).getUTCDay() || 7;
    const monday = todayUtc - (weekday - 1) * 86400000;
    return valueUtc >= monday && valueUtc < monday + 7 * 86400000;
  }

  function statusLabel(value) {
    return ({ pending: 'Pendiente', preparing: 'En preparación', ready: 'Listo', done: 'Completado', rejected: 'Rechazado' })[value] || value || 'Pendiente';
  }

  async function openPaymentProof(orderId) {
    const proof = state.paymentProofs.get(orderId);
    if (!proof?.imageData) return toast('Este pedido no tiene imagen de pago', 'warning');
    const popup = window.open('', '_blank');
    if (!popup) return toast('El navegador bloqueó la ventana del comprobante', 'warning');
    popup.opener = null;
    popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pago ${html(orderId.slice(-8))}</title><style>body{font-family:system-ui;margin:0;background:#111827;color:#fff}header{padding:14px;display:flex;gap:8px;justify-content:flex-end}button,a{padding:10px 14px;border-radius:8px;border:0;text-decoration:none;background:#f97316;color:#fff;font-weight:700}main{display:grid;place-items:center;padding:10px}img{max-width:100%;max-height:calc(100vh - 90px);object-fit:contain;background:#fff}@media print{header{display:none}body{background:#fff}img{max-height:none}}</style></head><body><header><a href="${proof.imageData}" download="${html(proof.fileName || 'pago.jpg')}">Descargar</a><button onclick="window.print()">Imprimir</button></header><main><img src="${proof.imageData}" alt="Comprobante de pago"></main></body></html>`);
    popup.document.close();
  }

  function renderAdminReceipts(orders) {
    const body = document.getElementById('kReceiptsBody');
    if (!body) return;
    const filtered = orders.filter(order => periodMatches(order, state.receiptPeriod));
    const summary = document.getElementById('kReceiptPeriodSummary');
    if (summary) summary.textContent = `${filtered.length} pedido(s) en el periodo seleccionado`;
    if (!filtered.length) {
      body.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">No hay pedidos en este periodo.</td></tr>';
      return;
    }
    body.innerHTML = filtered.map(order => {
      const date = order.createdAt?.toDate?.()?.toLocaleString('es-PE', { timeZone: 'America/Lima' }) || '-';
      const url = publicReceiptUrl(order);
      const rejected = String(order.status || '').toLowerCase() === 'rejected';
      const proof = state.paymentProofs.get(order.id);
      const method = ({ cash: 'Efectivo', card: 'Tarjeta', yape: 'Yape', plin: 'Plin' })[order.paymentMethod] || order.paymentMethod || 'No indicado';
      return `<tr>
        <td><code>${html(order.id.slice(-8))}</code></td>
        <td>${html(order.customer || 'Cliente')}</td>
        <td>${html(date)}</td>
        <td class="fw-bold">S/ ${Number(order.total || 0).toFixed(2)}</td>
        <td>${html(statusLabel(order.status))}</td>
        <td><span class="small">${html(method)}</span>${proof ? '<div><span class="badge text-bg-info mt-1">Imagen adjunta</span></div>' : ''}</td>
        <td>${receiptStatus(order)}</td>
        <td><div class="d-flex gap-1 flex-wrap">
          ${url ? `<a class="btn btn-primary btn-sm" href="${html(url)}" data-open-receipt><i class="bi bi-eye me-1"></i>Ver</a>
            <a class="btn btn-outline-primary btn-sm" href="${html(publicReceiptUrl(order, true))}" data-open-receipt><i class="bi bi-printer me-1"></i>Imprimir</a>` : `<button class="btn btn-primary btn-sm" data-issue-receipt="${html(order.id)}" ${rejected ? 'disabled title="No se emite para pedidos rechazados"' : ''}><i class="bi bi-file-earmark-pdf me-1"></i>Emitir</button>`}
          ${proof ? `<button class="btn btn-outline-info btn-sm kiosk-proof-button" data-view-proof="${html(order.id)}"><i class="bi bi-image me-1"></i>Pago</button>` : ''}
          ${url ? `<button class="btn btn-outline-secondary btn-sm" data-copy-receipt="${html(url)}" title="Copiar enlace"><i class="bi bi-link-45deg"></i></button>` : ''}
        </div></td>
      </tr>`;
    }).join('');
    body.querySelectorAll('[data-open-receipt]').forEach(link => {
      link.addEventListener('click', rememberReceiptReturnUrl);
    });
    body.querySelectorAll('[data-issue-receipt]').forEach(button => button.addEventListener('click', () => issueReceipt(button.dataset.issueReceipt, button)));
    body.querySelectorAll('[data-view-proof]').forEach(button => button.addEventListener('click', () => openPaymentProof(button.dataset.viewProof)));
    body.querySelectorAll('[data-copy-receipt]').forEach(button => button.addEventListener('click', async () => {
      await navigator.clipboard.writeText(button.dataset.copyReceipt);
      toast('Enlace público copiado', 'success');
    }));
  }

  function startAdminReceipts() {
    if (!window.auth?.currentUser) return;
    state.receiptsUnsubscribe?.();
    state.proofsUnsubscribe?.();
    const body = document.getElementById('kReceiptsBody');
    if (body) body.innerHTML = '<tr><td colspan="8" class="text-center py-4"><span class="spinner-border spinner-border-sm"></span></td></tr>';
    state.receiptsUnsubscribe = db.collection(COLL.orders).onSnapshot(snapshot => {
      state.adminOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      renderAdminReceipts(state.adminOrders);
    }, error => {
      if (body) body.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-4">${html(error.message)}</td></tr>`;
    });
    state.proofsUnsubscribe = db.collection('paymentProofs').onSnapshot(snapshot => {
      state.paymentProofs = new Map(snapshot.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() }]));
      renderAdminReceipts(state.adminOrders);
    }, error => console.warn('Comprobantes de pago:', error));
  }

  function randomToken() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  }

  async function reserveReceiptClientSide(orderId) {
    const orderRef = db.collection(COLL.orders).doc(orderId);
    const configRef = db.collection(COLL.config).doc('billing');
    return db.runTransaction(async transaction => {
      const orderSnapshot = await transaction.get(orderRef);
      const configSnapshot = await transaction.get(configRef);
      if (!orderSnapshot.exists) throw new Error('Pedido no encontrado');
      const order = orderSnapshot.data() || {};
      if (String(order.status || '').toLowerCase() === 'rejected') throw new Error('No se puede emitir un recibo para un pedido rechazado');
      const existing = order.billing || {};
      if (existing.publicToken && existing.number) return { id: orderId, ...order };
      const config = configSnapshot.exists ? configSnapshot.data() : {};
      const series = String(config.series || 'B001').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 10) || 'B001';
      const number = Math.max(1, Math.trunc(Number(config.nextNumber || 1)));
      const billing = {
        ...existing,
        series,
        number,
        publicToken: existing.publicToken || randomToken(),
        public: true,
        issuedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      transaction.set(configRef, { nextNumber: number + 1, series, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      transaction.update(orderRef, { billing });
      return { id: orderId, ...order, billing };
    });
  }

  function openPdfBlob(blob, popup = null) {
    const url = URL.createObjectURL(blob);
    if (popup && !popup.closed) {
      popup.location.replace(url);
    } else {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.target = '_blank';
      anchor.rel = 'noopener';
      anchor.click();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 300000);
  }

  function prepareReceiptPopup() {
    const popup = window.open('', '_blank');
    if (!popup) return null;
    popup.opener = null;
    popup.document.write('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Generando recibo</title><style>body{font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0;background:#f8fafc;color:#111827}div{text-align:center}span{display:inline-block;width:34px;height:34px;border:4px solid #e5e7eb;border-top-color:#f97316;border-radius:50%;animation:s 1s linear infinite}@keyframes s{to{transform:rotate(360deg)}}</style></head><body><div><span></span><p>Generando recibo…</p></div></body></html>');
    popup.document.close();
    return popup;
  }

  async function issueReceipt(orderId, button) {
    const original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Generando';

    try {
      rememberReceiptReturnUrl();

      if (apiBaseUrl()) {
        const response = await adminApi('/api/boleta', { body: { orderId } });
        const blob = await response.blob();
        location.assign(URL.createObjectURL(blob));
        return;
      }

      const order = await reserveReceiptClientSide(orderId);
      const url = publicReceiptUrl(order);
      if (!url) throw new Error('No se pudo generar el enlace público del recibo');
      location.assign(url);
    } catch (error) {
      sessionStorage.removeItem(RECEIPT_RETURN_KEY);
      toast(error.message, 'danger');
      button.disabled = false;
      button.innerHTML = original;
    }
  }

  function receiptMoney(value) {
    return `S/ ${Number(value || 0).toFixed(2)}`;
  }

  async function renderPublicReceiptPage() {
    const params = new URLSearchParams(location.search);
    const orderId = params.get('receiptOrder') || '';
    const token = params.get('receiptToken') || '';
    if (!orderId || !token) return false;
    const [orderSnapshot, themeSnapshot, billingSnapshot] = await Promise.all([
      db.collection(COLL.orders).doc(orderId).get(),
      db.collection(COLL.config).doc('theme').get(),
      db.collection(COLL.config).doc('billing').get()
    ]);
    if (!orderSnapshot.exists) throw new Error('Recibo no encontrado');
    const order = { id: orderId, ...orderSnapshot.data() };
    if (order.billing?.public !== true || String(order.billing?.publicToken || '') !== token) throw new Error('Enlace de recibo inválido');
    const theme = themeSnapshot.exists ? themeSnapshot.data() : {};
    const billing = billingSnapshot.exists ? billingSnapshot.data() : {};
    const total = Number(order.total || 0);
    const subtotal = billing.includesIgv === false ? total : total / 1.18;
    const igv = billing.includesIgv === false ? 0 : total - subtotal;
    const issued = order.billing?.issuedAt?.toDate?.() || order.createdAt?.toDate?.() || new Date();
    const documentNumber = `${order.billing?.series || 'B001'}-${String(order.billing?.number || '').padStart(8, '0')}`;
    const logo = theme.storeLogoUrl ? `<img class="kiosk-print-logo" src="${html(theme.storeLogoUrl)}" alt="Logo">` : `<div class="kiosk-print-logo d-grid place-items-center" style="font-size:42px">${html(theme.storeEmoji || '🛍️')}</div>`;
    document.body.className = 'kiosk-print-receipt-page';
    document.body.innerHTML = `
      <div class="kiosk-print-toolbar"><button id="kReceiptBack" class="btn btn-outline-secondary" type="button">
  Volver
</button><button class="btn btn-primary" onclick="window.print()"><i class="bi bi-printer me-1"></i>Imprimir / guardar PDF</button></div>
      <main class="kiosk-print-sheet">
        <header class="kiosk-print-header">${logo}<div><h1 class="h4 mb-2">${html(billing.businessName || theme.storeName || 'Kiosco')}</h1><div>${html(billing.address || '')}</div><div>${html(billing.phone || '')}</div><div>${html(billing.email || '')}</div></div><div class="kiosk-print-box"><div>RUC ${html(billing.ruc || 'POR CONFIGURAR')}</div><div>${html(billing.documentTitle || 'RECIBO DE VENTA')}</div><div>${html(documentNumber)}</div></div></header>
        <section class="kiosk-print-meta"><strong>Fecha de emisión</strong><span>${html(issued.toLocaleString('es-PE', { timeZone: 'America/Lima' }))}</span><strong>Cliente</strong><span>${html(order.customer || 'Cliente')}</span><strong>Teléfono</strong><span>${html(order.customerPhone || '-')}</span><strong>Entrega</strong><span>${html(order.deliveryAddress || (order.deliveryType === 'delivery' ? 'Delivery' : 'Recojo en tienda'))}</span><strong>Método de pago</strong><span>${html(({ cash: 'Efectivo', card: 'Tarjeta', yape: 'Yape', plin: 'Plin' })[order.paymentMethod] || order.paymentMethod || 'No indicado')}</span></section>
        <table class="kiosk-print-table"><thead><tr><th>Cant.</th><th>Unidad</th><th>Descripción</th><th>P. Unit.</th><th>Total</th></tr></thead><tbody>${(order.items || []).map(item => `<tr><td>${Number(item.qty || 0)}</td><td>${html(item.unit || 'UND')}</td><td>${html(item.name || 'Producto')}</td><td>${receiptMoney(item.price)}</td><td>${receiptMoney(item.subtotal ?? Number(item.price || 0) * Number(item.qty || 0))}</td></tr>`).join('')}</tbody></table>
        <div class="kiosk-print-totals"><div class="kiosk-print-total-row"><span>Op. gravadas</span><strong>${receiptMoney(subtotal)}</strong></div><div class="kiosk-print-total-row"><span>IGV 18%</span><strong>${receiptMoney(igv)}</strong></div><div class="kiosk-print-total-row kiosk-print-grand"><span>Total</span><span>${receiptMoney(total)}</span></div></div>
        <footer class="kiosk-print-footer">Representación impresa informativa. No sustituye un comprobante electrónico autorizado por SUNAT.<br>Pedido ${html(orderId)}</footer>
      </main>`;
    document.getElementById('kReceiptBack')?.addEventListener('click', returnFromReceipt);
    if (params.get('print') === '1') window.setTimeout(() => window.print(), 600);
    return true;
  }

  function clientIdentity() {
    try {
      return {
        name: window.Auth?.getClientName?.().trim() || localStorage.getItem('kk_name')?.trim() || '',
        phone: window.Auth?.getClientPhone?.().trim() || localStorage.getItem('kk_phone')?.trim() || ''
      };
    } catch { return { name: '', phone: '' }; }
  }

  function createPublicReceiptsPanel() {
    if (document.getElementById('kPublicReceipts')) return;
    const profileList = document.getElementById('profileOrdersList');
    if (profileList) {
      const panel = document.createElement('div');
      panel.id = 'kPublicReceipts';
      panel.className = 'mt-3';
      panel.innerHTML = '<div class="text-muted small">Cargando recibos…</div>';
      profileList.insertAdjacentElement('afterend', panel);
    }
  }

  function renderPublicReceipts(orders) {
    createPublicReceiptsPanel();
    const panel = document.getElementById('kPublicReceipts');
    if (!panel) return;
    const emitted = orders.filter(order => publicReceiptUrl(order));
    const pending = orders.filter(order => !publicReceiptUrl(order));
    panel.innerHTML = `
      <h6 class="fw-bold mb-2"><i class="bi bi-receipt me-2"></i>Mis recibos</h6>
      ${emitted.length ? emitted.map(order => {
        const url = publicReceiptUrl(order);
        return `<a class="kiosk-public-receipt" href="${html(url)}" data-open-receipt>
          <span><strong>Pedido ${html(order.id.slice(-8))}</strong><small>${html(order.billing.series || '')}-${String(order.billing.number || '').padStart(8, '0')}</small></span>
          <span><i class="bi bi-printer me-1"></i>Ver / imprimir</span>
        </a>`;
      }).join('') : '<div class="text-muted small">Todavía no tienes recibos emitidos.</div>'}
      ${pending.length ? `<div class="alert alert-secondary py-2 mt-2 mb-0 small">${pending.length} pedido(s) todavía pendientes de emisión.</div>` : ''}`;
    panel.querySelectorAll('[data-open-receipt]').forEach(link => {
      link.addEventListener('click', rememberReceiptReturnUrl);
    });
  }

  function startPublicReceipts() {
    createPublicReceiptsPanel();
    state.publicUnsubscribe?.();
    const identity = clientIdentity();
    if (!identity.name) return renderPublicReceipts([]);
    let query = db.collection(COLL.orders).where('customer', '==', identity.name);
    if (identity.phone) query = query.where('customerPhone', '==', identity.phone);
    state.publicUnsubscribe = query.limit(30).onSnapshot(snapshot => {
      const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      renderPublicReceipts(orders);
    }, error => console.warn('Recibos públicos:', error));
  }

  function subscribeConfiguration() {
    db.collection(COLL.config).doc('theme').onSnapshot(snapshot => {
      state.theme = snapshot.exists ? snapshot.data() : {};
      applyLiveTheme(state.theme);
      renderAppearance();
    }, error => console.warn('Theme:', error));
    db.collection(COLL.config).doc('billing').onSnapshot(snapshot => {
      state.billing = snapshot.exists ? snapshot.data() : {};
      renderAppearance();
    }, error => console.warn('Billing:', error));
  }

  function bindIdentityChanges() {
    document.getElementById('clientLoginForm')?.addEventListener('submit', () => setTimeout(startPublicReceipts, 200));
    document.getElementById('saveProfileBtn')?.addEventListener('click', () => setTimeout(startPublicReceipts, 200));
    document.getElementById('logoutClientBtn')?.addEventListener('click', () => setTimeout(startPublicReceipts, 200));
  }

  async function init() {
    if (!window.db || !window.firebase) return;
    try {
      if (await renderPublicReceiptPage()) return;
    } catch (error) {
      document.body.innerHTML = `<div class="container py-5"><div class="alert alert-danger">${html(error.message)}</div></div>`;
      return;
    }
    createAppearanceUpgrade();
    createReceiptsSection();
    createPublicReceiptsPanel();
    subscribeConfiguration();
    bindIdentityChanges();
    startPublicReceipts();
    auth?.onAuthStateChanged?.(user => {
      if (user && document.getElementById('sec-receipts')?.classList.contains('active')) startAdminReceipts();
    });
    window.KioscoReceiptsAppearance = Object.freeze({
      refreshPublicReceipts: startPublicReceipts,
      refreshAdminReceipts: startAdminReceipts
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 100), { once: true });
  else setTimeout(init, 100);
})();
