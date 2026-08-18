'use strict';

(() => {
  const KEYS = Object.freeze({
    view: 'kk_view_mode',
    price: 'kk_price_filter',
    sort: 'kk_sort_mode',
    accessible: 'kk_accessible',
    vibration: 'kk_vibration',
    productsCache: 'kk_prods_cache',
    categoriesCache: 'kk_cats_cache',
    variantCart: 'kk_cart_variants'
  });

  const state = {
    products: [],
    categories: [],
    schedule: [],
    storeOpen: null,
    priceMin: null,
    priceMax: null,
    sortMode: 'relevance',
    viewMode: 'grid',
    accessible: false,
    firstProductsReady: false,
    selectedProductFile: null,
    imagePreviewTimer: null,
    imagePreviewUrl: null,
    offer: null,
    offerTimer: null,
    featured: null,
    maintenance: null,
    variantProduct: null,
    variantCart: readJson(KEYS.variantCart, {}),
    checkoutBusy: false,
    access: { mainAdmin: false, member: null, permissions: null },
    orderNotificationUnsub: null,
    orderNotificationPrimed: false,
    knownOrderIds: new Set(),
    sessionLogged: false,
    catalogObserver: null,
    ordersObserver: null,
    staffObserver: null,
    swipe: null,
    cacheCategoryId: null
  };

  const fullPermissions = Object.freeze({
    dashboard: true,
    orders: true,
    products: { view: true, create: true, edit: true, delete: true },
    categories: { view: true, create: true, edit: true, delete: true },
    cash: true,
    expenses: true,
    schedule: true,
    staff: true,
    audit: true,
    appearance: true
  });

  const defaultEmployeePermissions = Object.freeze({
    dashboard: true,
    orders: true,
    products: { view: true, create: false, edit: false, delete: false },
    categories: { view: true, create: false, edit: false, delete: false },
    cash: true,
    expenses: true,
    schedule: false,
    staff: false,
    audit: false,
    appearance: false
  });

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      console.warn(`No se pudo leer ${key}:`, error);
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn(`No se pudo guardar ${key}:`, error);
      return false;
    }
  }

  function esc(value) {
    if (typeof window.esc === 'function') return window.esc(value);
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function notify(message, type = 'info') {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
      return;
    }
    console.info(`[Kiosco:${type}] ${message}`);
  }

  function getCurrency() {
    return window.APP_CONFIG?.currency || 'S/';
  }

  function money(value) {
    const amount = Number(value);
    return `${getCurrency()} ${Number.isFinite(amount) ? amount.toFixed(2) : '0.00'}`;
  }

  function localDate(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function toDate(value) {
    if (!value) return new Date(0);
    if (typeof value.toDate === 'function') return value.toDate();
    if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
    const result = value instanceof Date ? value : new Date(value);
    return Number.isNaN(result.getTime()) ? new Date(0) : result;
  }

  function normalizePhone(value) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.length > 9 ? digits.slice(-9) : digits;
  }

  function debounce(fn, delay = 120) {
    let timer = null;
    return (...args) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fn(...args), delay);
    };
  }

  function clonePermissions(source) {
    const base = source && typeof source === 'object' ? source : defaultEmployeePermissions;
    return {
      dashboard: base.dashboard !== false,
      orders: base.orders !== false,
      products: {
        view: base.products?.view !== false,
        create: Boolean(base.products?.create),
        edit: Boolean(base.products?.edit),
        delete: Boolean(base.products?.delete)
      },
      categories: {
        view: base.categories?.view !== false,
        create: Boolean(base.categories?.create),
        edit: Boolean(base.categories?.edit),
        delete: Boolean(base.categories?.delete)
      },
      cash: base.cash !== false,
      expenses: base.expenses !== false,
      schedule: Boolean(base.schedule),
      staff: Boolean(base.staff),
      audit: Boolean(base.audit),
      appearance: Boolean(base.appearance)
    };
  }

  function getFirebasePhone(user = window.auth?.currentUser) {
    return String(user?.phoneNumber || user?.phone_number || '').trim();
  }

  function isMainAdmin() {
    return Boolean(state.access.mainAdmin);
  }

  function permissionFor(section, action = 'view') {
    if (isMainAdmin()) return true;
    const p = state.access.permissions;
    if (!p) return false;
    const map = {
      dashboard: 'dashboard',
      orders: 'orders',
      products: 'products',
      categories: 'categories',
      caja: 'cash',
      cash: 'cash',
      gastos: 'expenses',
      expenses: 'expenses',
      horario: 'schedule',
      schedule: 'schedule',
      personal: 'staff',
      staff: 'staff',
      auditoria: 'audit',
      audit: 'audit',
      sessions: 'audit',
      apariencia: 'appearance',
      appearance: 'appearance'
    };
    const key = map[section] || section;
    const value = p[key];
    if (typeof value === 'boolean') return value;
    if (value && typeof value === 'object') return Boolean(value[action] ?? value.view);
    return false;
  }

  async function resolveAdministrativeAccess(user) {
    if (!user || !window.db) return false;
    const phone = getFirebasePhone(user);
    if (!phone) return false;
    try {
      const adminDoc = await db.collection(COLL.config).doc('admin').get();
      const adminPhones = adminDoc.exists && Array.isArray(adminDoc.data().phones) ? adminDoc.data().phones : [];
      if (adminPhones.includes(phone)) {
        state.access = { mainAdmin: true, member: null, permissions: clonePermissions(fullPermissions) };
        ensureStaffPhoneIndex().catch(() => {});
        return true;
      }
      const staffDoc = await db.collection(COLL.config).doc('staff').get();
      const members = staffDoc.exists && Array.isArray(staffDoc.data().members) ? staffDoc.data().members : [];
      const member = members.find(item => String(item.phone || '').trim() === phone);
      if (!member || !['employee', 'admin'].includes(String(member.role || 'employee'))) {
        state.access = { mainAdmin: false, member: null, permissions: null };
        return false;
      }
      state.access = {
        mainAdmin: false,
        member: { ...member },
        permissions: member.role === 'admin' ? clonePermissions(fullPermissions) : clonePermissions(member.permissions)
      };
      return true;
    } catch (error) {
      console.warn('No se pudo validar el acceso administrativo:', error);
      return false;
    }
  }

  function patchAuthAccess() {
    if (typeof Auth === 'undefined' || !Auth || Auth.__kioscoGranularAccess) return;
    const originalCheck = typeof Auth.checkIsAdmin === 'function' ? Auth.checkIsAdmin.bind(Auth) : null;
    if (!originalCheck) return;
    try {
      Auth.checkIsAdmin = async user => {
        try {
          if (await originalCheck(user)) {
            state.access = { mainAdmin: true, member: null, permissions: clonePermissions(fullPermissions) };
            await logAdminSession(user);
            return true;
          }
        } catch (error) {
          console.warn('Validación de administrador principal:', error);
        }
        const allowed = await resolveAdministrativeAccess(user);
        if (allowed) await logAdminSession(user);
        return allowed;
      };
      Auth.__kioscoGranularAccess = true;
    } catch (error) {
      console.warn('No se pudo ampliar el control de acceso:', error);
    }
  }

  async function ensureStaffPhoneIndex() {
    if (!state.access.mainAdmin || !window.db || !window.COLL) return;
    try {
      const ref = db.collection(COLL.config).doc('staff');
      const doc = await ref.get();
      if (!doc.exists) return;
      const members = Array.isArray(doc.data().members) ? doc.data().members : [];
      const phones = [...new Set(members.map(item => String(item.phone || '').trim()).filter(Boolean))];
      const current = Array.isArray(doc.data().phones) ? doc.data().phones : [];
      const same = current.length === phones.length && current.every(phone => phones.includes(phone));
      if (!same) await ref.set({ phones, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    } catch (error) {
      console.warn('No se pudo actualizar el índice de teléfonos del personal:', error);
    }
  }

  function browserFromUserAgent(ua) {
    const source = String(ua || '');
    const patterns = [
      ['Edge', /Edg\/([\d.]+)/],
      ['Chrome', /(?:Chrome|CriOS)\/([\d.]+)/],
      ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/],
      ['Safari', /Version\/([\d.]+).*Safari/]
    ];
    for (const [name, pattern] of patterns) {
      const match = source.match(pattern);
      if (match) return `${name} ${match[1]}`;
    }
    return 'Otro';
  }

  function osFromUserAgent(ua) {
    const source = String(ua || '');
    if (/Windows NT 10\.0/i.test(source)) return 'Windows 10/11';
    if (/Windows/i.test(source)) return 'Windows';
    if (/Android ([\d.]+)/i.test(source)) return `Android ${RegExp.$1}`;
    if (/iPhone OS ([\d_]+)/i.test(source)) return `iOS ${RegExp.$1.replace(/_/g, '.')}`;
    if (/iPad.*OS ([\d_]+)/i.test(source)) return `iPadOS ${RegExp.$1.replace(/_/g, '.')}`;
    if (/Mac OS X ([\d_]+)/i.test(source)) return `macOS ${RegExp.$1.replace(/_/g, '.')}`;
    if (/Linux/i.test(source)) return 'Linux';
    return 'Otro';
  }

  function isMobileUserAgent(ua) {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(String(ua || ''));
  }

  async function logAdminSession(user) {
    if (state.sessionLogged || !user || !window.db) return;
    const phone = getFirebasePhone(user);
    if (!phone) return;
    const sessionKey = `kk_session_logged_${user.uid || normalizePhone(phone)}`;
    if (sessionStorage.getItem(sessionKey) === '1') {
      state.sessionLogged = true;
      return;
    }
    try {
      await db.collection('session_log').add({
        phone,
        loginAt: firebase.firestore.FieldValue.serverTimestamp(),
        userAgent: navigator.userAgent || '',
        platform: navigator.platform || '',
        language: navigator.language || '',
        screenResolution: `${screen.width}x${screen.height}`
      });
      sessionStorage.setItem(sessionKey, '1');
      state.sessionLogged = true;
    } catch (error) {
      console.warn('No se pudo registrar la sesión administrativa:', error);
    }
  }

  function initSplash() {
    const splash = document.getElementById('kioscoSystemSplash');
    if (!splash) return;
    const finish = () => {
      if (!splash.isConnected || splash.classList.contains('kk-splash-hide')) return;
      splash.classList.add('kk-splash-hide');
      window.setTimeout(() => splash.remove(), 550);
    };
    window.setTimeout(finish, 4000);
    const maybeFinish = () => {
      if (window.db && state.firstProductsReady) finish();
    };
    window.addEventListener('store:products-updated', () => {
      state.firstProductsReady = true;
      maybeFinish();
    }, { once: true });
    if (window.Store?.getState?.().productsLoaded) {
      state.firstProductsReady = true;
      maybeFinish();
    }
  }

  function initLocalPreferences() {
    const storedView = localStorage.getItem(KEYS.view);
    state.viewMode = storedView === 'list' || storedView === 'grid'
      ? storedView
      : (window.matchMedia('(max-width: 991.98px)').matches ? 'list' : 'grid');
    const savedPrice = readJson(KEYS.price, {});
    state.priceMin = Number.isFinite(Number(savedPrice.min)) && savedPrice.min !== '' && savedPrice.min != null ? Number(savedPrice.min) : null;
    state.priceMax = Number.isFinite(Number(savedPrice.max)) && savedPrice.max !== '' && savedPrice.max != null ? Number(savedPrice.max) : null;
    state.sortMode = localStorage.getItem(KEYS.sort) || 'relevance';
    state.accessible = localStorage.getItem(KEYS.accessible) === 'true';
    applyAccessible(false);
  }

  function applyAccessible(showMessage = true) {
    document.documentElement.style.fontSize = state.accessible ? '20px' : '16px';
    document.body?.classList.toggle('accessible-mode', state.accessible);
    document.getElementById('kkAccessibleBtn')?.classList.toggle('active', state.accessible);
    document.getElementById('kkAccessibleBtn')?.setAttribute('aria-pressed', String(state.accessible));
    if (showMessage && state.accessible) notify('Modo accesible activado', 'success');
  }

  function ensureStoreHeaderEnhancements() {
    const header = document.querySelector('#page-store .site-header');
    if (!header) return;
    const logoWrap = header.querySelector('.logo-wrap');
    if (logoWrap && !document.getElementById('kkStoreStatusBadge')) {
      const badge = document.createElement('span');
      badge.id = 'kkStoreStatusBadge';
      badge.className = 'badge rounded-pill kk-store-status-badge d-none';
      badge.setAttribute('aria-live', 'polite');
      logoWrap.append(badge);
    }
    const actions = header.querySelector('.header-actions');
    if (actions && !document.getElementById('kkAccessibleBtn')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.id = 'kkAccessibleBtn';
      button.className = 'btn btn-outline-secondary btn-sm kk-accessibility-btn';
      button.title = 'Modo accesible';
      button.setAttribute('aria-label', 'Activar o desactivar modo accesible');
      button.setAttribute('aria-pressed', String(state.accessible));
      button.innerHTML = '<i class="bi bi-eye" aria-hidden="true"></i><span class="d-none d-lg-inline ms-1">Lectura fácil</span>';
      button.addEventListener('click', () => {
        state.accessible = !state.accessible;
        localStorage.setItem(KEYS.accessible, String(state.accessible));
        applyAccessible(true);
      });
      actions.prepend(button);
    }
    applyAccessible(false);
  }

  function ensureStoreControls() {
    const header = document.querySelector('#page-store .products-header');
    const grid = document.getElementById('productsGrid');
    if (!header || !grid) return;
    if (!document.getElementById('kkStoreToolbar')) {
      const toolbar = document.createElement('div');
      toolbar.id = 'kkStoreToolbar';
      toolbar.className = 'kk-store-toolbar';
      toolbar.innerHTML = `
        <div class="kk-sort-wrap">
          <label class="visually-hidden" for="kkSortMode">Ordenar productos</label>
          <select id="kkSortMode" class="form-select form-select-sm" aria-label="Ordenar productos">
            <option value="relevance">Relevancia</option>
            <option value="price-asc">Precio: menor a mayor</option>
            <option value="price-desc">Precio: mayor a menor</option>
            <option value="name-asc">Nombre: A-Z</option>
            <option value="name-desc">Nombre: Z-A</option>
            <option value="recent">Más recientes primero</option>
          </select>
        </div>
        <div class="small text-muted d-none d-xl-block">Filtra y ordena sin consultas adicionales</div>
        <div class="btn-group btn-group-sm kk-view-toggle" role="group" aria-label="Modo de vista">
          <button type="button" class="btn btn-outline-secondary" id="kkGridViewBtn" title="Vista cuadrícula"><i class="bi bi-grid"></i><span class="visually-hidden">Cuadrícula</span></button>
          <button type="button" class="btn btn-outline-secondary" id="kkListViewBtn" title="Vista lista"><i class="bi bi-list-ul"></i><span class="visually-hidden">Lista</span></button>
        </div>`;
      header.insertAdjacentElement('afterend', toolbar);

      const price = document.createElement('div');
      price.id = 'kkPriceFilter';
      price.className = 'kk-price-filter';
      price.innerHTML = `
        <div class="kk-price-input">
          <label class="form-label small mb-1" for="kkPriceMin">Precio mínimo</label>
          <div class="input-group input-group-sm"><span class="input-group-text">S/</span><input id="kkPriceMin" type="number" min="0" step="0.10" class="form-control" inputmode="decimal"></div>
        </div>
        <div class="kk-price-input">
          <label class="form-label small mb-1" for="kkPriceMax">Precio máximo</label>
          <div class="input-group input-group-sm"><span class="input-group-text">S/</span><input id="kkPriceMax" type="number" min="0" step="0.10" class="form-control" inputmode="decimal"></div>
        </div>
        <button type="button" id="kkApplyPriceBtn" class="btn btn-primary btn-sm" title="Aplicar filtro"><i class="bi bi-funnel me-1"></i>Aplicar</button>
        <button type="button" id="kkClearPriceBtn" class="btn btn-outline-secondary btn-sm" title="Limpiar filtro"><i class="bi bi-x me-1"></i>Limpiar</button>`;
      toolbar.insertAdjacentElement('afterend', price);
      const counter = document.createElement('div');
      counter.id = 'kkResultsCount';
      counter.className = 'kk-results-count';
      price.insertAdjacentElement('afterend', counter);

      const empty = document.createElement('div');
      empty.id = 'kkNoPriceResults';
      empty.className = 'kk-price-empty';
      empty.innerHTML = '<i class="bi bi-emoji-frown display-5 d-block mb-2"></i>Sin productos en ese rango de precio';
      grid.insertAdjacentElement('afterend', empty);

      const minInput = document.getElementById('kkPriceMin');
      const maxInput = document.getElementById('kkPriceMax');
      if (state.priceMin != null) minInput.value = String(state.priceMin);
      if (state.priceMax != null) maxInput.value = String(state.priceMax);
      const sortSelect = document.getElementById('kkSortMode');
      if ([...sortSelect.options].some(option => option.value === state.sortMode)) sortSelect.value = state.sortMode;

      document.getElementById('kkGridViewBtn').addEventListener('click', () => setViewMode('grid'));
      document.getElementById('kkListViewBtn').addEventListener('click', () => setViewMode('list'));
      sortSelect.addEventListener('change', event => {
        state.sortMode = event.target.value;
        localStorage.setItem(KEYS.sort, state.sortMode);
        applyCatalogEnhancements();
      });
      document.getElementById('kkApplyPriceBtn').addEventListener('click', () => {
        const min = minInput.value === '' ? null : Number(minInput.value);
        const max = maxInput.value === '' ? null : Number(maxInput.value);
        if (min != null && (!Number.isFinite(min) || min < 0)) return notify('Precio mínimo inválido', 'warning');
        if (max != null && (!Number.isFinite(max) || max < 0)) return notify('Precio máximo inválido', 'warning');
        if (min != null && max != null && min > max) return notify('El precio mínimo no puede superar al máximo', 'warning');
        state.priceMin = min;
        state.priceMax = max;
        writeJson(KEYS.price, { min, max });
        applyCatalogEnhancements();
      });
      document.getElementById('kkClearPriceBtn').addEventListener('click', () => {
        minInput.value = '';
        maxInput.value = '';
        state.priceMin = null;
        state.priceMax = null;
        localStorage.removeItem(KEYS.price);
        applyCatalogEnhancements();
      });
    }
    setViewMode(state.viewMode, false);
  }

  function setViewMode(mode, persist = true) {
    state.viewMode = mode === 'list' ? 'list' : 'grid';
    if (persist) localStorage.setItem(KEYS.view, state.viewMode);
    const grid = document.getElementById('productsGrid');
    grid?.classList.toggle('kk-list-mode', state.viewMode === 'list');
    document.getElementById('kkGridViewBtn')?.classList.toggle('active', state.viewMode === 'grid');
    document.getElementById('kkListViewBtn')?.classList.toggle('active', state.viewMode === 'list');
  }

  function getProductMap() {
    return new Map(state.products.map(product => [String(product.id), product]));
  }

  function productTimestamp(product) {
    return toDate(product?.createdAt).getTime();
  }

  function applyCatalogEnhancements() {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;
    setViewMode(state.viewMode, false);
    const productMap = getProductMap();
    const columns = [...grid.children].filter(child => child.querySelector?.('.prod-card[data-product-id]'));
    const activePriceFilter = state.priceMin != null || state.priceMax != null;
    let visible = 0;
    columns.forEach(column => {
      const id = column.querySelector('.prod-card[data-product-id]')?.dataset.productId;
      const product = productMap.get(String(id));
      const price = Number(product?.price || 0);
      const allowed = product
        && (state.priceMin == null || price >= state.priceMin)
        && (state.priceMax == null || price <= state.priceMax);
      column.classList.toggle('d-none', !allowed);
      if (allowed) visible += 1;
    });

    if (state.sortMode !== 'relevance') {
      const sorted = [...columns].sort((left, right) => {
        const leftId = left.querySelector('.prod-card[data-product-id]')?.dataset.productId;
        const rightId = right.querySelector('.prod-card[data-product-id]')?.dataset.productId;
        const a = productMap.get(String(leftId)) || {};
        const b = productMap.get(String(rightId)) || {};
        if (state.sortMode === 'price-asc') return Number(a.price || 0) - Number(b.price || 0);
        if (state.sortMode === 'price-desc') return Number(b.price || 0) - Number(a.price || 0);
        if (state.sortMode === 'name-desc') return String(b.name || '').localeCompare(String(a.name || ''), 'es', { sensitivity: 'base' });
        if (state.sortMode === 'recent') return productTimestamp(b) - productTimestamp(a);
        return String(a.name || '').localeCompare(String(b.name || ''), 'es', { sensitivity: 'base' });
      });
      sorted.forEach(column => grid.append(column));
    }
    const counter = document.getElementById('kkResultsCount');
    if (counter) counter.textContent = `${visible} ${visible === 1 ? 'producto encontrado' : 'productos encontrados'}`;
    const empty = document.getElementById('kkNoPriceResults');
    empty?.classList.toggle('show', activePriceFilter && columns.length > 0 && visible === 0);
  }

  const scheduleCatalogApply = debounce(applyCatalogEnhancements, 50);

  function observeCatalog() {
    const grid = document.getElementById('productsGrid');
    if (!grid || state.catalogObserver) return;
    state.catalogObserver = new MutationObserver(scheduleCatalogApply);
    state.catalogObserver.observe(grid, { childList: true, subtree: true });
  }

  function cacheStoreData(type, list) {
    if (!Array.isArray(list)) return;
    writeJson(type === 'products' ? KEYS.productsCache : KEYS.categoriesCache, list);
  }

  function hydrateFromStore() {
    state.products = window.Store?.getProducts?.() || [];
    state.categories = window.Store?.getCategories?.() || [];
    if (state.products.length) cacheStoreData('products', state.products);
    if (state.categories.length) cacheStoreData('categories', state.categories);
    refreshAdminProductSelects();
    applyCatalogEnhancements();
    renderFeatured();
    renderOffer();
  }

  function bindStoreEvents() {
    window.addEventListener('store:products-updated', event => {
      state.products = Array.isArray(event.detail?.products) ? event.detail.products : (window.Store?.getProducts?.() || []);
      cacheStoreData('products', state.products);
      state.firstProductsReady = true;
      refreshAdminProductSelects();
      scheduleCatalogApply();
      renderFeatured();
      renderOffer();
      syncVariantCartWithProducts();
    });
    window.addEventListener('store:categories-updated', event => {
      state.categories = Array.isArray(event.detail?.categories) ? event.detail.categories : (window.Store?.getCategories?.() || []);
      cacheStoreData('categories', state.categories);
    });
    window.addEventListener('store:filter-changed', scheduleCatalogApply);
    window.addEventListener('cart:updated', scheduleCatalogApply);
  }

  function ensureOfflineBanner() {
    if (document.getElementById('kkOfflineBanner')) return;
    const page = document.getElementById('page-store');
    if (!page) return;
    const banner = document.createElement('div');
    banner.id = 'kkOfflineBanner';
    banner.className = 'kk-offline-banner';
    banner.innerHTML = '<i class="bi bi-wifi-off me-2"></i>Sin conexión — Mostrando productos guardados';
    page.prepend(banner);
  }

  function updateOfflineUi() {
    ensureOfflineBanner();
    document.getElementById('kkOfflineBanner')?.classList.toggle('show', !navigator.onLine);
    if (!navigator.onLine) renderOfflineCacheIfNeeded();
  }

  function renderOfflineCacheIfNeeded() {
    const current = window.Store?.getProducts?.() || [];
    if (current.length) return;
    const cachedProducts = readJson(KEYS.productsCache, []);
    const cachedCategories = readJson(KEYS.categoriesCache, []);
    if (!Array.isArray(cachedProducts) || !cachedProducts.length) return;
    state.products = cachedProducts;
    state.categories = Array.isArray(cachedCategories) ? cachedCategories : [];
    renderCachedProducts();
    renderCachedCategories();
  }

  function renderCachedProducts() {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;
    const products = state.products.filter(product => product.active !== false && (!state.cacheCategoryId || product.categoryId === state.cacheCategoryId || product.subcategoryId === state.cacheCategoryId));
    grid.innerHTML = products.map(product => {
      const image = product.resolvedImageUrl || product.imageUrl || '';
      const stock = product.stock == null ? null : Number(product.stock);
      return `<div class="col"><article class="card h-100 prod-card" data-product-id="${esc(product.id)}">
        <div class="prod-img-wrap position-relative">${image ? `<img src="${esc(image)}" alt="${esc(product.name)}" class="card-img-top prod-img" loading="lazy">` : '<div class="prod-img-placeholder d-flex align-items-center justify-content-center h-100"><i class="bi bi-bag display-4 text-muted"></i></div>'}</div>
        <div class="card-body d-flex flex-column p-3">
          <h3 class="card-title prod-name mb-1 h6">${esc(product.name)}</h3>
          ${product.description ? `<p class="card-text prod-desc text-muted small mb-2">${esc(product.description)}</p>` : ''}
          <div class="mt-auto"><div class="d-flex justify-content-between align-items-center gap-2 mb-2"><span class="prod-price fw-bold">${money(product.price)} / ${esc(product.unit || 'Unidad')}</span>${stock != null ? `<small class="${stock <= 0 ? 'text-danger' : 'text-muted'}">Disponible: ${Math.max(stock, 0)}</small>` : ''}</div>
          <button type="button" class="btn btn-sm w-100 ${stock === 0 ? 'btn-outline-secondary' : 'btn-primary'} btn-add" data-kk-cache-add="${esc(product.id)}" ${stock === 0 ? 'disabled' : ''}><i class="bi bi-cart-plus me-1"></i>${stock === 0 ? 'Agotado' : 'Agregar'}</button></div>
        </div></article></div>`;
    }).join('');
    applyCatalogEnhancements();
  }

  function renderCachedCategories() {
    const targets = [document.getElementById('categoryList'), document.getElementById('categoryListMobile')].filter(Boolean);
    if (!targets.length || !state.categories.length) return;
    const mains = state.categories.filter(category => !category.parentId && category.active !== false);
    targets.forEach(target => {
      target.innerHTML = `<li class="nav-item"><a href="#" class="nav-link cat-link ${!state.cacheCategoryId ? 'active' : ''}" data-kk-cache-cat="">Todos</a></li>` + mains.map(category => {
        const children = state.categories.filter(item => item.parentId === category.id && item.active !== false);
        return `<li class="nav-item"><a href="#" class="nav-link cat-link ${state.cacheCategoryId === category.id ? 'active' : ''}" data-kk-cache-cat="${esc(category.id)}"><i class="bi bi-tag me-2"></i>${esc(category.name)}</a>${children.length ? `<ul class="nav flex-column ms-3">${children.map(child => `<li class="nav-item"><a href="#" class="nav-link cat-link subcat-link ${state.cacheCategoryId === child.id ? 'active' : ''}" data-kk-cache-cat="${esc(child.id)}"><i class="bi bi-arrow-return-right me-2"></i>${esc(child.name)}</a></li>`).join('')}</ul>` : ''}</li>`;
      }).join('');
    });
  }

  function bindOfflineEvents() {
    ensureOfflineBanner();
    updateOfflineUi();
    window.addEventListener('offline', updateOfflineUi);
    window.addEventListener('online', () => {
      updateOfflineUi();
      window.Store?.reconnect?.();
    });
    document.addEventListener('click', event => {
      const add = event.target.closest('[data-kk-cache-add]');
      if (add) {
        event.preventDefault();
        const product = state.products.find(item => String(item.id) === add.dataset.kkCacheAdd);
        if (product) handleProductAdd(product);
        return;
      }
      const cat = event.target.closest('[data-kk-cache-cat]');
      if (cat && !navigator.onLine) {
        event.preventDefault();
        state.cacheCategoryId = cat.dataset.kkCacheCat || null;
        renderCachedProducts();
        renderCachedCategories();
      }
    }, true);
  }

  function ensureBackToTop() {
    if (document.getElementById('kkBackTop')) return;
    const button = document.createElement('button');
    button.id = 'kkBackTop';
    button.type = 'button';
    button.className = 'kk-back-top';
    button.title = 'Volver arriba';
    button.setAttribute('aria-label', 'Volver al inicio');
    button.innerHTML = '<i class="bi bi-arrow-up" aria-hidden="true"></i>';
    document.body.append(button);
    const main = document.querySelector('#page-store .products-main');
    const refresh = () => {
      const y = Math.max(window.scrollY || 0, main?.scrollTop || 0);
      button.classList.toggle('show', y > 300);
    };
    window.addEventListener('scroll', refresh, { passive: true });
    main?.addEventListener('scroll', refresh, { passive: true });
    button.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      main?.scrollTo({ top: 0, behavior: 'smooth' });
    });
    refresh();
  }

  function scheduleForToday() {
    if (!Array.isArray(state.schedule) || !state.schedule.length) return null;
    const index = (new Date().getDay() + 6) % 7;
    return state.schedule[index] || null;
  }

  function calculateStoreOpen() {
    const day = scheduleForToday();
    if (!day || day.open === undefined) return null;
    if (!day.open) return false;
    const now = new Date();
    const current = now.getHours() * 60 + now.getMinutes();
    const parse = value => {
      const [h, m] = String(value || '').split(':').map(Number);
      return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
    };
    const from = parse(day.from);
    const to = parse(day.to);
    if (from == null || to == null) return null;
    if (from <= to) return current >= from && current < to;
    return current >= from || current < to;
  }

  function formatTodaySchedule() {
    const day = scheduleForToday();
    if (!day) return '';
    if (!day.open) return 'Hoy: cerrado';
    return `Hoy: ${day.from || '—'} - ${day.to || '—'}`;
  }

  function updateStoreStatusBadge() {
    const badge = document.getElementById('kkStoreStatusBadge');
    state.storeOpen = calculateStoreOpen();
    if (!badge) return;
    if (state.storeOpen == null) {
      badge.className = 'badge rounded-pill kk-store-status-badge d-none';
      badge.textContent = '';
      updateClosedCheckoutWarning();
      return;
    }
    badge.className = `badge rounded-pill kk-store-status-badge ${state.storeOpen ? 'open' : 'closed'}`;
    badge.innerHTML = `<i class="bi bi-circle-fill" aria-hidden="true"></i>${state.storeOpen ? 'Abierto' : 'Cerrado'}`;
    updateClosedCheckoutWarning();
    renderMaintenance();
  }

  function updateClosedCheckoutWarning() {
    const modal = document.getElementById('orderModal');
    if (!modal) return;
    let alert = document.getElementById('kkClosedOrderWarning');
    if (!alert) {
      alert = document.createElement('div');
      alert.id = 'kkClosedOrderWarning';
      alert.className = 'alert alert-warning d-none';
      alert.innerHTML = '<i class="bi bi-clock-history me-2"></i>La tienda está fuera de horario. Tu pedido será procesado cuando abramos.';
      const body = modal.querySelector('.modal-body');
      body?.prepend(alert);
    }
    alert.classList.toggle('d-none', state.storeOpen !== false);
  }

  function bindSchedule() {
    if (!window.db || !window.COLL) return;
    db.collection(COLL.config).doc('settings').onSnapshot(snapshot => {
      state.schedule = snapshot.exists && Array.isArray(snapshot.data().schedule) ? snapshot.data().schedule : [];
      updateStoreStatusBadge();
    }, error => console.warn('Horario de tienda:', error));
    updateStoreStatusBadge();
    window.setInterval(updateStoreStatusBadge, 60000);
    document.getElementById('orderModal')?.addEventListener('show.bs.modal', updateClosedCheckoutWarning);
  }

  function ensureOfferBanner() {
    if (document.getElementById('kkOfferBanner')) return;
    const header = document.querySelector('#page-store .site-header');
    if (!header) return;
    const banner = document.createElement('div');
    banner.id = 'kkOfferBanner';
    banner.className = 'kk-offer-banner d-none';
    header.insertAdjacentElement('afterend', banner);
  }

  function offerEndDate(offer) {
    const time = String(offer?.endTime || '').trim();
    if (!/^\d{2}:\d{2}$/.test(time)) return null;
    const [h, m] = time.split(':').map(Number);
    const end = new Date();
    end.setHours(h, m, 0, 0);
    return end;
  }

  function renderOffer() {
    ensureOfferBanner();
    const banner = document.getElementById('kkOfferBanner');
    if (!banner) return;
    window.clearInterval(state.offerTimer);
    state.offerTimer = null;
    const offer = state.offer;
    const product = state.products.find(item => String(item.id) === String(offer?.productId || ''));
    const end = offerEndDate(offer);
    const hideKey = offer ? `kk_offer_hidden_${offer.productId || ''}_${offer.endTime || ''}` : '';
    if (!offer || offer.active === false || !product || !end || Date.now() >= end.getTime() || sessionStorage.getItem(hideKey) === '1') {
      banner.classList.add('d-none');
      return;
    }
    const update = () => {
      const left = Math.max(0, end.getTime() - Date.now());
      if (left <= 0) {
        window.clearInterval(state.offerTimer);
        state.offerTimer = null;
        banner.classList.add('d-none');
        return;
      }
      const total = Math.floor(left / 1000);
      const hh = String(Math.floor(total / 3600)).padStart(2, '0');
      const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
      const ss = String(total % 60).padStart(2, '0');
      banner.querySelector('.kk-offer-timer')?.replaceChildren(document.createTextNode(`${hh}:${mm}:${ss}`));
    };
    banner.innerHTML = `<div class="kk-offer-main"><strong><i class="bi bi-lightning-charge-fill me-1"></i>${esc(offer.bannerText || 'Oferta del día')}</strong><span>${esc(product.name)}</span><span class="kk-offer-price-old">${money(product.price)}</span><span class="kk-offer-price-new">${money(offer.offerPrice)}</span><span class="kk-offer-timer">00:00:00</span></div><button type="button" class="btn-close" aria-label="Cerrar oferta"></button>`;
    banner.querySelector('.btn-close')?.addEventListener('click', () => {
      sessionStorage.setItem(hideKey, '1');
      banner.classList.add('d-none');
      window.clearInterval(state.offerTimer);
    });
    banner.classList.remove('d-none');
    update();
    state.offerTimer = window.setInterval(update, 1000);
  }

  function bindOffer() {
    if (!window.db || !window.COLL) return;
    db.collection(COLL.config).doc('offer').onSnapshot(snapshot => {
      state.offer = snapshot.exists ? snapshot.data() : null;
      renderOffer();
      populateOfferAdmin();
    }, error => console.warn('Oferta del día:', error));
  }

  function ensureFeatured() {
    if (document.getElementById('kkFeaturedProduct')) return;
    const main = document.querySelector('#page-store .products-main');
    const header = main?.querySelector('.products-header');
    if (!main || !header) return;
    const section = document.createElement('section');
    section.id = 'kkFeaturedProduct';
    section.className = 'kk-featured d-none';
    section.setAttribute('aria-label', 'Producto del día');
    header.insertAdjacentElement('beforebegin', section);
  }

  function renderFeatured() {
    ensureFeatured();
    const section = document.getElementById('kkFeaturedProduct');
    if (!section) return;
    const config = state.featured;
    const product = state.products.find(item => String(item.id) === String(config?.productId || ''));
    if (!config || config.date !== localDate() || !product) {
      section.classList.add('d-none');
      section.innerHTML = '';
      return;
    }
    const image = product.resolvedImageUrl || product.imageUrl || '';
    section.innerHTML = `<div class="kk-featured-image">${image ? `<img src="${esc(image)}" alt="${esc(product.name)}">` : '<i class="bi bi-bag display-2 text-muted"></i>'}</div><div class="kk-featured-body"><span class="badge text-bg-warning kk-featured-badge mb-2">OFERTA DEL DÍA</span><h2 class="h4 mb-2">${esc(product.name)}</h2>${product.description ? `<p class="text-muted">${esc(product.description)}</p>` : ''}<div class="h5 text-primary fw-bold mb-2">${money(product.price)}</div>${config.message ? `<p class="mb-3 fw-semibold">${esc(config.message)}</p>` : ''}<button type="button" class="btn btn-primary align-self-start" id="kkFeaturedAdd"><i class="bi bi-cart-plus me-2"></i>Agregar al carrito</button></div>`;
    section.querySelector('#kkFeaturedAdd')?.addEventListener('click', () => handleProductAdd(product));
    section.classList.remove('d-none');
  }

  function bindFeatured() {
    if (!window.db || !window.COLL) return;
    db.collection(COLL.config).doc('featured').onSnapshot(snapshot => {
      state.featured = snapshot.exists ? snapshot.data() : null;
      renderFeatured();
      populateFeaturedAdmin();
    }, error => console.warn('Producto del día:', error));
  }

  function ensureMaintenanceScreen() {
    if (document.getElementById('kkMaintenance')) return;
    const page = document.getElementById('page-store');
    if (!page) return;
    const section = document.createElement('section');
    section.id = 'kkMaintenance';
    section.className = 'kk-maintenance';
    page.append(section);
  }

  function renderMaintenance() {
    ensureMaintenanceScreen();
    const section = document.getElementById('kkMaintenance');
    if (!section) return;
    const active = Boolean(state.maintenance?.active);
    const authenticatedAdmin = Boolean(window.auth?.currentUser && (state.access.mainAdmin || state.access.member));
    const show = active && !authenticatedAdmin;
    document.body.classList.toggle('kk-maintenance-active', show);
    section.classList.toggle('show', show);
    if (!show) return;
    const storeName = document.querySelector('.logo-text')?.textContent?.trim() || window.APP_CONFIG?.storeName || 'Kiosco';
    section.innerHTML = `<div class="kk-maintenance-card"><img src="icons/icon-192.png" alt="${esc(storeName)}"><div><i class="bi bi-tools" aria-hidden="true"></i></div><h1 class="h3 mt-3">Estamos realizando mantenimiento</h1><p class="lead">${esc(state.maintenance?.message || 'Estamos actualizando el sistema. Volvemos pronto.')}</p>${formatTodaySchedule() ? `<p class="text-muted mb-0"><i class="bi bi-clock me-2"></i>${esc(formatTodaySchedule())}</p>` : ''}</div>`;
  }

  function bindMaintenance() {
    if (!window.db || !window.COLL) return;
    db.collection(COLL.config).doc('maintenance').onSnapshot(snapshot => {
      state.maintenance = snapshot.exists ? snapshot.data() : null;
      renderMaintenance();
      populateMaintenanceAdmin();
    }, error => console.warn('Modo mantenimiento:', error));
    window.auth?.onAuthStateChanged?.(async user => {
      if (user) await resolveAdministrativeAccess(user);
      else state.access = { mainAdmin: false, member: null, permissions: null };
      renderMaintenance();
      applyPermissionsToAdmin();
      if (user) startOrderNotifications(); else stopOrderNotifications();
    });
  }

  function variantDefinitions(product) {
    if (!Array.isArray(product?.variants)) return [];
    return product.variants.filter(variant => variant && String(variant.name || '').trim() && Array.isArray(variant.options) && variant.options.length);
  }

  function ensureVariantModal() {
    if (document.getElementById('kkVariantModal')) return;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `<div class="modal fade" id="kkVariantModal" tabindex="-1" aria-hidden="true"><div class="modal-dialog modal-dialog-centered modal-sm"><div class="modal-content"><div class="modal-header"><h5 class="modal-title"><i class="bi bi-ui-checks-grid me-2"></i>Elige una variante</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div><form id="kkVariantForm"><div class="modal-body" id="kkVariantFields"></div><div class="modal-footer"><button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button><button type="submit" class="btn btn-primary"><i class="bi bi-cart-plus me-1"></i>Agregar</button></div></form></div></div></div>`;
    document.body.append(wrapper.firstElementChild);
    document.getElementById('kkVariantForm')?.addEventListener('submit', event => {
      event.preventDefault();
      const product = state.variantProduct;
      if (!product) return;
      const variants = variantDefinitions(product);
      const selections = [];
      let extra = 0;
      for (let index = 0; index < variants.length; index += 1) {
        const select = document.getElementById(`kkVariantSelect${index}`);
        if (!select?.value) return notify(`Selecciona ${variants[index].name}`, 'warning');
        selections.push(select.value);
        extra += Number(variants[index].extraPrice || 0);
      }
      const variantItem = {
        ...product,
        name: `${product.name} - ${selections.join(' / ')}`,
        price: Number(product.price || 0) + extra
      };
      state.variantCart[product.id] = {
        name: variantItem.name,
        price: variantItem.price,
        selections,
        extraPrice: extra
      };
      writeJson(KEYS.variantCart, state.variantCart);
      const ok = window.Cart?.add?.(variantItem);
      if (ok) {
        bootstrap.Modal.getInstance(document.getElementById('kkVariantModal'))?.hide();
        notify('Producto agregado con la variante seleccionada', 'success');
      }
    });
  }

  function openVariantModal(product) {
    const variants = variantDefinitions(product);
    if (!variants.length) return window.Cart?.add?.(product);
    ensureVariantModal();
    state.variantProduct = product;
    const fields = document.getElementById('kkVariantFields');
    fields.innerHTML = `<p class="small text-muted mb-3">${esc(product.name)} · ${money(product.price)} base</p>` + variants.map((variant, index) => `<div class="mb-3"><label class="form-label" for="kkVariantSelect${index}">${esc(variant.name)}</label><select class="form-select" id="kkVariantSelect${index}" required><option value="">Seleccionar</option>${variant.options.map(option => `<option value="${esc(option)}">${esc(option)}</option>`).join('')}</select>${Number(variant.extraPrice || 0) ? `<div class="form-text">Adicional: ${money(variant.extraPrice)}</div>` : ''}</div>`).join('');
    bootstrap.Modal.getOrCreateInstance(document.getElementById('kkVariantModal')).show();
  }

  function handleProductAdd(product) {
    if (!product) return false;
    if (variantDefinitions(product).length) {
      openVariantModal(product);
      return true;
    }
    return Boolean(window.Cart?.add?.(product));
  }

  function bindVariantStoreInterception() {
    document.addEventListener('click', event => {
      const button = event.target.closest('#productsGrid [data-store-action]');
      if (!button) return;
      const action = button.dataset.storeAction;
      const product = state.products.find(item => String(item.id) === String(button.dataset.productId || ''));
      if (!product || !variantDefinitions(product).length) return;
      if (action === 'add') {
        event.preventDefault();
        event.stopImmediatePropagation();
        openVariantModal(product);
        return;
      }
      if (action === 'increase') {
        const variant = state.variantCart[product.id];
        if (!variant) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        window.Cart?.add?.({ ...product, name: variant.name, price: variant.price });
      }
    }, true);
  }

  function patchCartForVariantsAndCheckout() {
    if (!window.Cart || Cart.__kioscoSystemPatched) return;
    const originalAdd = Cart.add.bind(Cart);
    const originalRemove = Cart.remove.bind(Cart);
    const originalRemoveAll = Cart.removeAll.bind(Cart);
    const originalClear = Cart.clear.bind(Cart);
    const originalSync = Cart.syncProducts.bind(Cart);

    Cart.add = (product, amount = 1) => {
      const variant = state.variantCart[String(product?.id || '')];
      const effective = variant && product ? { ...product, name: variant.name, price: variant.price } : product;
      return originalAdd(effective, amount);
    };
    Cart.remove = (id, amount = 1) => {
      const before = Cart.qty(id);
      const result = originalRemove(id, amount);
      if (before > 0 && Cart.qty(id) === 0 && state.variantCart[id]) {
        delete state.variantCart[id];
        writeJson(KEYS.variantCart, state.variantCart);
      }
      return result;
    };
    Cart.removeAll = id => {
      const result = originalRemoveAll(id);
      if (state.variantCart[id]) {
        delete state.variantCart[id];
        writeJson(KEYS.variantCart, state.variantCart);
      }
      return result;
    };
    Cart.clear = options => {
      const result = originalClear(options);
      if (result) {
        state.variantCart = {};
        writeJson(KEYS.variantCart, state.variantCart);
      }
      return result;
    };
    Cart.syncProducts = list => {
      originalSync(list);
      const items = Cart.getItems();
      items.forEach(item => {
        const variant = state.variantCart[item.id];
        const product = Array.isArray(list) ? list.find(entry => String(entry.id) === String(item.id)) : null;
        if (!variant || !product) return;
        if (item.name === variant.name && Number(item.price) === Number(variant.price)) return;
        const qty = item.qty;
        originalRemoveAll(item.id);
        originalAdd({ ...product, name: variant.name, price: variant.price }, qty);
      });
    };

    Cart.checkout = async (customerName, customerPhone, notes, deliveryType, address, scheduledDate, scheduledTime, gpsCoords) => {
      const items = Cart.getItems();
      if (!items.length) throw new Error('El carrito está vacío');
      if (!String(customerName || '').trim()) throw new Error('El nombre del cliente es obligatorio');
      if (deliveryType === 'delivery' && !String(address || '').trim()) throw new Error('La dirección de entrega es obligatoria');
      if (!navigator.onLine) throw new Error('Sin conexión. Tu carrito se mantiene guardado. Intenta enviar el pedido cuando recuperes internet.');
      if (state.checkoutBusy) throw new Error('El pedido ya se está procesando');
      if (!window.db || !window.COLL) throw new Error('Firestore no está disponible');

      const phone = normalizePhone(customerPhone);
      if (phone) {
        const blocked = await db.collection('blocked_clients').where('phone', '==', phone).limit(1).get();
        if (!blocked.empty) throw new Error('No podemos procesar tu pedido en este momento. Contáctanos para más información.');
      }

      state.checkoutBusy = true;
      try {
        const orderReference = db.collection(COLL.orders).doc();
        await db.runTransaction(async transaction => {
          const productSnapshots = [];
          for (const item of items) {
            const productReference = db.collection(COLL.products).doc(item.id);
            const productSnapshot = await transaction.get(productReference);
            productSnapshots.push({ item, productReference, productSnapshot });
          }
          const orderItems = [];
          for (const entry of productSnapshots) {
            const { item, productReference, productSnapshot } = entry;
            if (!productSnapshot.exists) throw new Error(`El producto ${item.name} ya no existe`);
            const product = productSnapshot.data() || {};
            if (product.active === false) throw new Error(`El producto ${item.name} no está disponible`);
            const currentStock = product.stock == null || product.stock === '' ? null : Math.max(0, Math.trunc(Number(product.stock)));
            if (currentStock !== null && currentStock < item.qty) throw new Error(`Stock insuficiente para ${item.name}. Disponible: ${currentStock}`);
            const basePrice = Math.max(0, Number(product.price || 0));
            const variant = state.variantCart[item.id];
            const finalName = variant?.name || String(product.name || item.name);
            const finalPrice = variant ? Math.max(0, Number(variant.price || basePrice)) : basePrice;
            const unit = String(product.unit || item.unit || 'Unidad').trim();
            orderItems.push({
              productId: item.id,
              name: finalName,
              price: Number(finalPrice.toFixed(2)),
              qty: item.qty,
              unit,
              subtotal: Number((finalPrice * item.qty).toFixed(2)),
              variants: variant?.selections || null
            });
            if (currentStock !== null) {
              transaction.update(productReference, {
                stock: currentStock - item.qty,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
              });
            }
          }
          const orderTotal = orderItems.reduce((sum, item) => sum + item.subtotal, 0);
          transaction.set(orderReference, {
            customer: String(customerName).trim(),
            customerPhone: String(customerPhone || '').trim() || null,
            items: orderItems,
            total: Number(orderTotal.toFixed(2)),
            itemCount: orderItems.reduce((sum, item) => sum + item.qty, 0),
            status: 'pending',
            paymentMethod: window.KioscoFinalImprovements?.getCheckoutExtras?.().paymentMethod || window.KioscoUpgrades?.getSelectedPaymentMethod?.() || 'cash',
            paymentGroup: window.KioscoFinalImprovements?.getCheckoutExtras?.().paymentGroup || null,
            paymentProofExpected: Boolean(window.KioscoFinalImprovements?.getCheckoutExtras?.().paymentProofExpected),
            notes: String(notes || '').trim().slice(0, 300) || null,
            deliveryType: deliveryType || 'pickup',
            deliveryAddress: String(address || '').trim() || null,
            scheduledDate: scheduledDate || null,
            scheduledTime: scheduledTime || null,
            location: gpsCoords || null,
            source: 'web',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        });
        Cart.clear();
        return orderReference.id;
      } finally {
        state.checkoutBusy = false;
      }
    };
    Cart.__kioscoSystemPatched = true;
  }

  function syncVariantCartWithProducts() {
    if (!window.Cart || !Object.keys(state.variantCart).length) return;
    Cart.syncProducts?.(state.products);
  }

  function estimateImageSize(width, height) {
    const estimatedBytes = Math.max(1024, Math.round(width * height * 0.35));
    return estimatedBytes;
  }

  function humanBytes(bytes) {
    const number = Number(bytes || 0);
    if (number < 1024) return `${number} B`;
    if (number < 1024 * 1024) return `${(number / 1024).toFixed(1)} KB`;
    return `${(number / (1024 * 1024)).toFixed(2)} MB`;
  }

  function ensureImageProductEnhancements() {
    const url = document.getElementById('productImageUrl');
    const file = document.getElementById('productImageFile');
    if (!url || !file) return;
    url.placeholder = 'https://ejemplo.com/imagen.jpg';
    file.accept = 'image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif';
    const parent = file.parentElement;
    if (!document.getElementById('kkImageTools')) {
      const tools = document.createElement('div');
      tools.id = 'kkImageTools';
      tools.className = 'kk-image-tools';
      tools.innerHTML = `<button type="button" id="kkPasteImageUrl" class="btn btn-outline-secondary btn-sm align-self-start"><i class="bi bi-clipboard me-1"></i>Pegar desde portapapeles</button><div id="kkProductDropZone" class="kk-drop-zone" tabindex="0" role="button"><i class="bi bi-cloud-arrow-up d-block mb-1"></i><span>Arrastra una imagen aquí o haz clic para seleccionar · JPG, PNG, WEBP o GIF · máximo 5MB</span></div><div id="kkImageError" class="kk-image-error">No se pudo cargar la imagen. Verifica el URL.</div><div id="kkImageMeta" class="kk-image-meta"></div>`;
      parent?.insertAdjacentElement('afterend', tools);
      const zone = document.getElementById('kkProductDropZone');
      zone?.addEventListener('click', () => file.click());
      zone?.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          file.click();
        }
      });
      ['dragenter', 'dragover'].forEach(name => zone?.addEventListener(name, event => {
        event.preventDefault();
        zone.classList.add('dragover');
      }));
      ['dragleave', 'drop'].forEach(name => zone?.addEventListener(name, event => {
        event.preventDefault();
        zone.classList.remove('dragover');
      }));
      zone?.addEventListener('drop', event => {
        const dropped = event.dataTransfer?.files?.[0];
        if (dropped) selectProductImageFile(dropped);
      });
      document.getElementById('kkPasteImageUrl')?.addEventListener('click', async () => {
        try {
          const text = await navigator.clipboard.readText();
          url.value = String(text || '').trim();
          previewProductUrlDebounced(url.value);
        } catch (error) {
          notify('No se pudo leer el portapapeles. Verifica el permiso del navegador.', 'warning');
        }
      });
    }
    ensureVariantEditor();
  }

  function setImageError(show) {
    document.getElementById('kkImageError')?.classList.toggle('show', Boolean(show));
  }

  function updateImageMeta(width, height, bytes, estimated = false) {
    const meta = document.getElementById('kkImageMeta');
    if (!meta) return;
    meta.textContent = width && height ? `${width} × ${height} px · ${estimated ? 'peso estimado ' : ''}${humanBytes(bytes)}` : '';
  }

  function setSharedPreview(source) {
    const preview = document.getElementById('productImgPreview');
    const empty = document.getElementById('productImgPreviewEmpty');
    if (!preview) return;
    if (!source) {
      preview.removeAttribute('src');
      preview.style.display = 'none';
      if (empty) empty.style.display = 'flex';
      return;
    }
    preview.src = source;
  }

  function previewProductUrl(urlValue) {
    const url = String(urlValue || '').trim();
    state.selectedProductFile = null;
    if (!url) {
      setImageError(false);
      updateImageMeta(0, 0, 0);
      setSharedPreview(null);
      return;
    }
    let parsed;
    try {
      parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
    } catch (error) {
      setImageError(true);
      updateImageMeta(0, 0, 0);
      return;
    }
    const image = new Image();
    image.onload = () => {
      setImageError(false);
      const estimated = estimateImageSize(image.naturalWidth, image.naturalHeight);
      updateImageMeta(image.naturalWidth, image.naturalHeight, estimated, true);
      setSharedPreview(url);
    };
    image.onerror = () => {
      setImageError(true);
      updateImageMeta(0, 0, 0);
      const preview = document.getElementById('productImgPreview');
      if (preview) preview.style.display = 'none';
    };
    image.src = url;
  }

  const previewProductUrlDebounced = debounce(previewProductUrl, 600);

  function validateProductFile(file) {
    if (!file) throw new Error('Selecciona una imagen');
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    const ext = String(file.name || '').split('.').pop()?.toLowerCase();
    if (!allowed.has(String(file.type || '').toLowerCase()) && !['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
      throw new Error('Formato no permitido. Usa JPG, PNG, WEBP o GIF.');
    }
    if (file.size <= 0) throw new Error('La imagen está vacía');
    if (file.size > 5 * 1024 * 1024) throw new Error('La imagen no debe superar 5MB');
  }

  function selectProductImageFile(file) {
    try {
      validateProductFile(file);
    } catch (error) {
      notify(error.message, 'danger');
      return;
    }
    state.selectedProductFile = file;
    setImageError(false);
    if (state.imagePreviewUrl) URL.revokeObjectURL(state.imagePreviewUrl);
    state.imagePreviewUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => updateImageMeta(image.naturalWidth, image.naturalHeight, file.size, false);
    image.src = state.imagePreviewUrl;
    setSharedPreview(state.imagePreviewUrl);
  }

  function ensureVariantEditor() {
    const description = document.getElementById('productDesc');
    if (!description || document.getElementById('kkVariantsEditor')) return;
    const row = description.closest('.mb-3, .col-12, .col-md-12, .col') || description.parentElement;
    const section = document.createElement('section');
    section.id = 'kkVariantsEditor';
    section.className = 'kk-variants';
    section.innerHTML = `<div class="d-flex justify-content-between align-items-center gap-2 mb-2"><div><strong>Variantes (opcional)</strong><div class="form-text">Ejemplo: Sabor · Fresa, Vainilla, Chocolate</div></div><button type="button" class="btn btn-outline-primary btn-sm" id="kkAddVariant"><i class="bi bi-plus me-1"></i>Agregar variante</button></div><div id="kkVariantRows"></div>`;
    row?.insertAdjacentElement('afterend', section);
    document.getElementById('kkAddVariant')?.addEventListener('click', () => addVariantRow());
  }

  function addVariantRow(variant = {}) {
    const container = document.getElementById('kkVariantRows');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'kk-variant-row';
    row.innerHTML = `<div><label class="form-label small">Nombre</label><input type="text" class="form-control form-control-sm kk-variant-name" placeholder="Sabor" value="${esc(variant.name || '')}"></div><div><label class="form-label small">Opciones separadas por comas</label><input type="text" class="form-control form-control-sm kk-variant-options" placeholder="Fresa, Vainilla, Chocolate" value="${esc(Array.isArray(variant.options) ? variant.options.join(', ') : '')}"></div><div><label class="form-label small">Precio adicional</label><input type="number" min="0" step="0.10" class="form-control form-control-sm kk-variant-extra" value="${Number(variant.extraPrice || 0)}"></div><button type="button" class="btn btn-outline-danger btn-sm kk-remove-variant" title="Eliminar variante"><i class="bi bi-trash"></i></button>`;
    row.querySelector('.kk-remove-variant')?.addEventListener('click', () => row.remove());
    container.append(row);
  }

  function readVariantRows() {
    return [...document.querySelectorAll('#kkVariantRows .kk-variant-row')].map(row => {
      const name = row.querySelector('.kk-variant-name')?.value.trim() || '';
      const options = (row.querySelector('.kk-variant-options')?.value || '').split(',').map(item => item.trim()).filter(Boolean);
      const extraPrice = Number(row.querySelector('.kk-variant-extra')?.value || 0);
      if (!name && !options.length) return null;
      if (!name || !options.length) throw new Error('Cada variante debe tener nombre y al menos una opción');
      if (!Number.isFinite(extraPrice) || extraPrice < 0) throw new Error('El precio adicional de la variante es inválido');
      return { name, options, extraPrice };
    }).filter(Boolean);
  }

  function populateProductVariantsFromModal() {
    ensureImageProductEnhancements();
    const container = document.getElementById('kkVariantRows');
    if (!container) return;
    container.innerHTML = '';
    const id = document.getElementById('productId')?.value || '';
    const product = window.Admin?.getProducts?.().find(item => String(item.id) === String(id));
    const variants = Array.isArray(product?.variants) ? product.variants : [];
    variants.forEach(addVariantRow);
    state.selectedProductFile = null;
    setImageError(false);
    const currentUrl = document.getElementById('productImageUrl')?.value || product?.resolvedImageUrl || product?.imageUrl || '';
    if (currentUrl) previewProductUrlDebounced(currentUrl);
    else updateImageMeta(0, 0, 0);
  }

  async function uploadFirebaseProductImage(productId, file) {
    validateProductFile(file);
    if (!window.storage) throw new Error('Firebase Storage no está disponible. Usa una URL externa para la imagen.');
    const safe = String(file.name || 'imagen').replace(/[^a-zA-Z0-9._-]/g, '-').slice(-90);
    const path = `products/${productId}/${Date.now()}-${safe}`;
    try {
      const snapshot = await storage.ref(path).put(file, { contentType: file.type || 'image/jpeg' });
      return { imagePath: path, imageUrl: await snapshot.ref.getDownloadURL() };
    } catch (error) {
      throw new Error(`No se pudo subir a Firebase Storage. Puedes usar una URL externa. ${error?.message || ''}`.trim());
    }
  }

  async function saveProductEnhanced(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const id = document.getElementById('productId')?.value || '';
    const name = document.getElementById('productName')?.value.trim() || '';
    const price = Number(document.getElementById('productPrice')?.value);
    const stockRaw = document.getElementById('productStock')?.value.trim() || '';
    const discount = Number(document.getElementById('productDiscount')?.value || 0);
    const enteredImageUrl = document.getElementById('productImageUrl')?.value.trim() || '';
    if (!name) return notify('El nombre es obligatorio', 'danger');
    if (window.auth?.currentUser) {
      const action = id ? 'edit' : 'create';
      if (!permissionFor('products', action)) return notify('No tienes permiso para guardar productos.', 'warning');
    }
    if (!Number.isFinite(price) || price < 0) return notify('Precio inválido', 'danger');
    if (stockRaw !== '' && (!Number.isInteger(Number(stockRaw)) || Number(stockRaw) < 0)) return notify('Stock inválido', 'danger');
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) return notify('El descuento debe estar entre 0 y 100', 'danger');
    if (enteredImageUrl && document.getElementById('kkImageError')?.classList.contains('show')) return notify('No se pudo cargar la imagen. Verifica el URL.', 'danger');
    let variants;
    try {
      variants = readVariantRows();
    } catch (error) {
      return notify(error.message, 'danger');
    }
    const products = window.Admin?.getProducts?.() || [];
    const existing = products.find(product => String(product.id) === String(id));
    const reference = id ? db.collection(COLL.products).doc(id) : db.collection(COLL.products).doc();
    const button = event.submitter || event.target.querySelector('[type="submit"]');
    const oldHtml = button?.innerHTML;
    if (button) {
      button.disabled = true;
      button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Guardando';
    }
    let uploadedPath = null;
    try {
      const data = {
        name,
        description: document.getElementById('productDesc')?.value.trim() || '',
        emoji: document.getElementById('productEmoji')?.value.trim() || null,
        price,
        stock: stockRaw === '' ? null : Number(stockRaw),
        unit: document.getElementById('productUnit')?.value || 'Unidad',
        discountPercent: discount,
        categoryId: document.getElementById('productCategory')?.value || null,
        subcategoryId: document.getElementById('productSubcat')?.value || null,
        active: Boolean(document.getElementById('productActive')?.checked),
        variants,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      if (state.selectedProductFile) {
        const uploaded = await uploadFirebaseProductImage(reference.id, state.selectedProductFile);
        data.imagePath = uploaded.imagePath;
        data.imageUrl = uploaded.imageUrl;
        uploadedPath = uploaded.imagePath;
      } else if (existing && enteredImageUrl && enteredImageUrl === String(existing.imageUrl || existing.resolvedImageUrl || '').trim()) {
        data.imagePath = existing.imagePath || null;
        data.imageUrl = existing.imageUrl || existing.resolvedImageUrl || enteredImageUrl;
      } else if (enteredImageUrl) {
        data.imagePath = null;
        data.imageUrl = enteredImageUrl;
      } else if (existing) {
        data.imagePath = existing.imagePath || null;
        data.imageUrl = existing.imageUrl || null;
      } else {
        data.imagePath = null;
        data.imageUrl = null;
      }
      if (id) await reference.update(data);
      else {
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await reference.set(data);
      }
      if (existing?.imagePath && existing.imagePath !== data.imagePath && !String(existing.imagePath).startsWith('cloudinary:') && window.storage) {
        storage.ref(existing.imagePath).delete().catch(() => {});
      }
      notify(id ? 'Producto actualizado' : 'Producto creado', 'success');
      bootstrap.Modal.getInstance(document.getElementById('productModal'))?.hide();
      state.selectedProductFile = null;
      if (state.imagePreviewUrl) {
        URL.revokeObjectURL(state.imagePreviewUrl);
        state.imagePreviewUrl = null;
      }
    } catch (error) {
      if (uploadedPath && window.storage) storage.ref(uploadedPath).delete().catch(() => {});
      notify(`No se pudo guardar el producto: ${error.message}`, 'danger');
    } finally {
      if (button) {
        button.disabled = false;
        button.innerHTML = oldHtml;
      }
    }
  }

  function bindProductAdminEnhancements() {
    ensureImageProductEnhancements();
    document.addEventListener('input', event => {
      if (event.target?.id !== 'productImageUrl') return;
      event.stopImmediatePropagation();
      previewProductUrlDebounced(event.target.value);
    }, true);
    document.addEventListener('change', event => {
      if (event.target?.id !== 'productImageFile') return;
      event.stopImmediatePropagation();
      const file = event.target.files?.[0];
      if (file) selectProductImageFile(file);
    }, true);
    document.addEventListener('submit', event => {
      if (event.target?.id === 'productForm') saveProductEnhanced(event);
    }, true);
    document.getElementById('productModal')?.addEventListener('shown.bs.modal', populateProductVariantsFromModal);
  }

  function ensureAppearancePanel() {
    const section = document.getElementById('sec-apariencia');
    if (!section || document.getElementById('kkAppearanceTools')) return;
    const container = document.createElement('div');
    container.id = 'kkAppearanceTools';
    container.className = 'kk-admin-card';
    container.innerHTML = `<div class="kk-admin-grid">
      <div class="card"><div class="card-body"><h3 class="h6"><i class="bi bi-lightning-charge me-2"></i>Oferta del día</h3><form id="kkOfferForm"><div class="form-check form-switch mb-3"><input class="form-check-input" type="checkbox" id="kkOfferActive" checked><label class="form-check-label" for="kkOfferActive">Oferta activa</label></div><div class="mb-2"><label class="form-label">Producto</label><select class="form-select" id="kkOfferProduct" required></select></div><div class="mb-2"><label class="form-label">Precio de oferta</label><input type="number" min="0" step="0.10" class="form-control" id="kkOfferPrice" required></div><div class="mb-2"><label class="form-label">Texto del banner</label><input type="text" maxlength="100" class="form-control" id="kkOfferText" placeholder="Oferta especial de hoy"></div><div class="mb-3"><label class="form-label">Hora de fin</label><input type="time" class="form-control" id="kkOfferEnd" required></div><button class="btn btn-primary btn-sm" type="submit"><i class="bi bi-save me-1"></i>Guardar oferta</button></form></div></div>
      <div class="card"><div class="card-body"><h3 class="h6"><i class="bi bi-star me-2"></i>Producto del día</h3><form id="kkFeaturedForm"><div class="mb-2"><label class="form-label">Producto</label><select class="form-select" id="kkFeaturedSelect" required></select></div><div class="mb-3"><label class="form-label">Mensaje promocional</label><input type="text" maxlength="140" class="form-control" id="kkFeaturedMessage" placeholder="¡Oferta especial de hoy!"></div><button class="btn btn-primary btn-sm" type="submit"><i class="bi bi-save me-1"></i>Guardar producto destacado</button></form></div></div>
      <div class="card"><div class="card-body"><h3 class="h6"><i class="bi bi-cone-striped me-2"></i>Modo mantenimiento</h3><form id="kkMaintenanceForm"><div class="form-check form-switch mb-3"><input class="form-check-input" type="checkbox" id="kkMaintenanceActive"><label class="form-check-label" for="kkMaintenanceActive">Activar mantenimiento</label></div><div class="mb-3"><label class="form-label">Mensaje</label><textarea class="form-control" id="kkMaintenanceMessage" rows="3" maxlength="240" placeholder="Estamos actualizando el sistema. Volvemos pronto."></textarea></div><button class="btn btn-primary btn-sm" type="submit"><i class="bi bi-save me-1"></i>Guardar mantenimiento</button></form></div></div>
      <div class="card" id="kkVibrationCard"><div class="card-body"><h3 class="h6"><i class="bi bi-phone-vibrate me-2"></i>Alertas del administrador</h3><div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="kkVibrationToggle"><label class="form-check-label" for="kkVibrationToggle">Vibración al recibir pedidos</label></div><div class="form-text mt-2">Usa vibración del dispositivo y un beep corto cuando entra un pedido nuevo.</div></div></div>
    </div>`;
    section.append(container);
    if (!('vibrate' in navigator)) document.getElementById('kkVibrationCard')?.classList.add('d-none');
    const vibration = localStorage.getItem(KEYS.vibration) !== 'false';
    const toggle = document.getElementById('kkVibrationToggle');
    if (toggle) toggle.checked = vibration;
    toggle?.addEventListener('change', event => localStorage.setItem(KEYS.vibration, String(event.target.checked)));
    document.getElementById('kkOfferForm')?.addEventListener('submit', saveOfferAdmin);
    document.getElementById('kkFeaturedForm')?.addEventListener('submit', saveFeaturedAdmin);
    document.getElementById('kkMaintenanceForm')?.addEventListener('submit', saveMaintenanceAdmin);
    refreshAdminProductSelects();
    populateOfferAdmin();
    populateFeaturedAdmin();
    populateMaintenanceAdmin();
  }

  function activeAdminProducts() {
    const source = window.Admin?.getProducts?.() || state.products;
    return source.filter(product => product.active !== false).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));
  }

  function refreshAdminProductSelects() {
    const options = activeAdminProducts().map(product => `<option value="${esc(product.id)}">${esc(product.name)}</option>`).join('');
    ['kkOfferProduct', 'kkFeaturedSelect'].forEach(id => {
      const select = document.getElementById(id);
      if (!select) return;
      const current = select.value;
      select.innerHTML = `<option value="">Seleccionar producto</option>${options}`;
      if ([...select.options].some(option => option.value === current)) select.value = current;
    });
    populateOfferAdmin();
    populateFeaturedAdmin();
  }

  function populateOfferAdmin() {
    if (!state.offer) return;
    const active = document.getElementById('kkOfferActive');
    const product = document.getElementById('kkOfferProduct');
    const price = document.getElementById('kkOfferPrice');
    const text = document.getElementById('kkOfferText');
    const end = document.getElementById('kkOfferEnd');
    if (active) active.checked = state.offer.active !== false;
    if (product && [...product.options].some(option => option.value === String(state.offer.productId || ''))) product.value = String(state.offer.productId || '');
    if (price) price.value = state.offer.offerPrice ?? '';
    if (text) text.value = state.offer.bannerText || '';
    if (end) end.value = state.offer.endTime || '';
  }

  async function saveOfferAdmin(event) {
    event.preventDefault();
    const productId = document.getElementById('kkOfferProduct')?.value || '';
    const offerPrice = Number(document.getElementById('kkOfferPrice')?.value);
    const endTime = document.getElementById('kkOfferEnd')?.value || '';
    if (!productId) return notify('Selecciona un producto para la oferta', 'warning');
    if (!Number.isFinite(offerPrice) || offerPrice < 0) return notify('Precio de oferta inválido', 'warning');
    if (!endTime) return notify('Selecciona la hora de fin', 'warning');
    try {
      await db.collection(COLL.config).doc('offer').set({
        active: Boolean(document.getElementById('kkOfferActive')?.checked),
        productId,
        offerPrice,
        bannerText: document.getElementById('kkOfferText')?.value.trim() || 'Oferta del día',
        endTime,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      notify('Oferta del día guardada', 'success');
    } catch (error) {
      notify(`No se pudo guardar la oferta: ${error.message}`, 'danger');
    }
  }

  function populateFeaturedAdmin() {
    if (!state.featured) return;
    const select = document.getElementById('kkFeaturedSelect');
    const message = document.getElementById('kkFeaturedMessage');
    if (select && [...select.options].some(option => option.value === String(state.featured.productId || ''))) select.value = String(state.featured.productId || '');
    if (message) message.value = state.featured.message || '';
  }

  async function saveFeaturedAdmin(event) {
    event.preventDefault();
    const productId = document.getElementById('kkFeaturedSelect')?.value || '';
    if (!productId) return notify('Selecciona un producto del día', 'warning');
    try {
      await db.collection(COLL.config).doc('featured').set({
        productId,
        message: document.getElementById('kkFeaturedMessage')?.value.trim() || '',
        date: localDate(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      notify('Producto del día guardado', 'success');
    } catch (error) {
      notify(`No se pudo guardar el producto del día: ${error.message}`, 'danger');
    }
  }

  function populateMaintenanceAdmin() {
    const active = document.getElementById('kkMaintenanceActive');
    const message = document.getElementById('kkMaintenanceMessage');
    if (active) active.checked = Boolean(state.maintenance?.active);
    if (message && state.maintenance) message.value = state.maintenance.message || '';
  }

  async function saveMaintenanceAdmin(event) {
    event.preventDefault();
    try {
      await db.collection(COLL.config).doc('maintenance').set({
        active: Boolean(document.getElementById('kkMaintenanceActive')?.checked),
        message: document.getElementById('kkMaintenanceMessage')?.value.trim() || 'Estamos actualizando el sistema. Volvemos pronto.',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      notify('Modo mantenimiento actualizado', 'success');
    } catch (error) {
      notify(`No se pudo actualizar mantenimiento: ${error.message}`, 'danger');
    }
  }

  function ensureStaffPermissionsEditor() {
    const form = document.getElementById('staffForm');
    if (!form || document.getElementById('kkStaffPermissions')) return;
    const section = document.createElement('div');
    section.id = 'kkStaffPermissions';
    section.className = 'mt-3';
    section.innerHTML = `<h6 class="mb-2"><i class="bi bi-shield-check me-2"></i>Permisos de acceso</h6><div class="kk-permissions-grid">
      ${permissionGroup('General', [['dashboard','Dashboard (ver)'],['orders','Pedidos (ver y gestionar)'],['cash','Caja (ver y operar)'],['expenses','Gastos (ver y registrar)'],['schedule','Horario (ver y editar)'],['staff','Personal (ver)'],['audit','Auditoría (ver)'],['appearance','Apariencia (ver y editar)']])}
      ${permissionGroup('Productos', [['products.view','Ver'],['products.create','Crear'],['products.edit','Editar'],['products.delete','Eliminar']])}
      ${permissionGroup('Categorías', [['categories.view','Ver'],['categories.create','Crear'],['categories.edit','Editar'],['categories.delete','Eliminar']])}
    </div>`;
    form.querySelector('.modal-body')?.append(section) || form.append(section);
    setStaffPermissionInputs(defaultEmployeePermissions);
  }

  function permissionGroup(title, items) {
    return `<div class="kk-permissions-group"><strong>${esc(title)}</strong>${items.map(([key, label]) => `<div class="form-check"><input class="form-check-input kk-permission" type="checkbox" data-permission="${esc(key)}" id="kkPerm_${key.replace('.', '_')}"><label class="form-check-label small" for="kkPerm_${key.replace('.', '_')}">${esc(label)}</label></div>`).join('')}</div>`;
  }

  function setStaffPermissionInputs(permissions) {
    const p = clonePermissions(permissions);
    document.querySelectorAll('.kk-permission').forEach(input => {
      const [key, sub] = input.dataset.permission.split('.');
      input.checked = sub ? Boolean(p[key]?.[sub]) : Boolean(p[key]);
    });
  }

  function readStaffPermissionInputs() {
    const p = clonePermissions({ dashboard: false, orders: false, products: {}, categories: {}, cash: false, expenses: false, schedule: false, staff: false, audit: false, appearance: false });
    document.querySelectorAll('.kk-permission').forEach(input => {
      const [key, sub] = input.dataset.permission.split('.');
      if (sub) p[key][sub] = input.checked;
      else p[key] = input.checked;
    });
    return p;
  }

  async function saveStaffEnhanced(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const name = document.getElementById('staffName')?.value.trim() || '';
    const digits = normalizePhone(document.getElementById('staffPhone')?.value || '');
    const phone = digits ? `+51${digits}` : '';
    const role = document.getElementById('staffRole')?.value || 'employee';
    if (digits.length !== 9) return notify('Teléfono inválido', 'danger');
    const permissions = role === 'admin' ? clonePermissions(fullPermissions) : readStaffPermissionInputs();
    try {
      const ref = db.collection(COLL.config).doc('staff');
      const doc = await ref.get();
      const members = doc.exists && Array.isArray(doc.data().members) ? [...doc.data().members] : [];
      const editIndex = Number(document.getElementById('staffForm')?.dataset.kkEditIndex);
      const editing = Number.isInteger(editIndex) && editIndex >= 0 && editIndex < members.length;
      const duplicate = members.findIndex((member, index) => String(member.phone || '') === phone && (!editing || index !== editIndex));
      if (duplicate >= 0) return notify('Ese teléfono ya está registrado', 'warning');
      const member = { name, phone, role, permissions };
      if (editing) members[editIndex] = member;
      else members.push(member);
      const phones = [...new Set(members.map(item => String(item.phone || '').trim()).filter(Boolean))];
      await ref.set({ members, phones, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      notify(editing ? 'Personal actualizado' : 'Personal agregado', 'success');
      bootstrap.Modal.getInstance(document.getElementById('staffModal'))?.hide();
      const form = document.getElementById('staffForm');
      if (form) delete form.dataset.kkEditIndex;
      document.querySelector('[data-admin-section="personal"]')?.click();
      window.setTimeout(decorateStaffTable, 120);
    } catch (error) {
      notify(`No se pudo guardar el personal: ${error.message}`, 'danger');
    }
  }

  async function decorateStaffTable() {
    ensureStaffPermissionsEditor();
    const table = document.getElementById('staffTable');
    if (!table || !window.db) return;
    try {
      const doc = await db.collection(COLL.config).doc('staff').get();
      const members = doc.exists && Array.isArray(doc.data().members) ? doc.data().members : [];
      [...table.querySelectorAll('tr')].forEach((row, index) => {
        if (!members[index] || row.querySelector('[data-kk-staff-edit]')) return;
        const cell = row.lastElementChild;
        if (!cell) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-outline-primary btn-sm me-1';
        button.dataset.kkStaffEdit = String(index);
        button.title = 'Editar empleado';
        button.innerHTML = '<i class="bi bi-pencil"></i>';
        button.addEventListener('click', () => openStaffEdit(index, members[index]));
        cell.prepend(button);
      });
    } catch (error) {
      console.warn('Personal:', error);
    }
  }

  function openStaffEdit(index, member) {
    ensureStaffPermissionsEditor();
    const form = document.getElementById('staffForm');
    if (!form) return;
    form.dataset.kkEditIndex = String(index);
    document.getElementById('staffName').value = member.name || '';
    document.getElementById('staffPhone').value = normalizePhone(member.phone || '');
    document.getElementById('staffRole').value = member.role || 'employee';
    setStaffPermissionInputs(member.role === 'admin' ? fullPermissions : member.permissions);
    bootstrap.Modal.getOrCreateInstance(document.getElementById('staffModal')).show();
  }

  function bindStaffEnhancements() {
    ensureStaffPermissionsEditor();
    document.addEventListener('submit', event => {
      if (event.target?.id === 'staffForm') saveStaffEnhanced(event);
    }, true);
    document.getElementById('btnAddStaff')?.addEventListener('click', () => {
      const form = document.getElementById('staffForm');
      if (form) delete form.dataset.kkEditIndex;
      window.setTimeout(() => setStaffPermissionInputs(defaultEmployeePermissions), 0);
    }, true);
    const table = document.getElementById('staffTable');
    if (table && !state.staffObserver) {
      state.staffObserver = new MutationObserver(debounce(decorateStaffTable, 40));
      state.staffObserver.observe(table, { childList: true, subtree: true });
    }
    decorateStaffTable();
  }

  function applyPermissionsToAdmin() {
    const p = state.access.permissions;
    if (!p && !state.access.mainAdmin) return;
    document.querySelectorAll('[data-admin-section]').forEach(link => {
      const section = link.dataset.adminSection || '';
      link.style.display = permissionFor(section) ? '' : 'none';
    });
    const deleteProductAllowed = permissionFor('products', 'delete');
    const editProductAllowed = permissionFor('products', 'edit');
    document.querySelectorAll('#adminProductsGrid [onclick*="Admin.editProduct"]').forEach(button => button.style.display = editProductAllowed ? '' : 'none');
    document.querySelectorAll('#adminProductsGrid [onclick*="Admin.deleteProduct"]').forEach(button => button.style.display = deleteProductAllowed ? '' : 'none');
    const createProductAllowed = permissionFor('products', 'create');
    const addProduct = document.getElementById('btnAddProduct');
    if (addProduct) addProduct.style.display = createProductAllowed ? '' : 'none';
    const addCat = document.getElementById('btnAddCat');
    const addSub = document.getElementById('btnAddSubcat');
    const createCatAllowed = permissionFor('categories', 'create');
    if (addCat) addCat.style.display = createCatAllowed ? '' : 'none';
    if (addSub) addSub.style.display = createCatAllowed ? '' : 'none';
  }

  function bindPermissionGuard() {
    document.addEventListener('click', event => {
      const link = event.target.closest('[data-admin-section]');
      if (!link || !window.auth?.currentUser) return;
      const section = link.dataset.adminSection || '';
      if (permissionFor(section)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      notify('No tienes permiso para acceder a esta sección.', 'warning');
      const dashboard = document.querySelector('[data-admin-section="dashboard"]');
      if (dashboard && permissionFor('dashboard')) dashboard.click();
    }, true);
    window.addEventListener('hashchange', () => {
      const section = location.hash.replace(/^#/, '');
      if (section && !permissionFor(section)) {
        location.hash = '';
        notify('No tienes permiso para acceder a esta sección.', 'warning');
        document.querySelector('[data-admin-section="dashboard"]')?.click();
      }
    });
    window.addEventListener('admin:products-updated', () => window.setTimeout(applyPermissionsToAdmin, 0));
  }

  function ensureBlockedClientsPanel() {
    const section = document.getElementById('sec-personal');
    if (!section || document.getElementById('kkBlockedClientsCard')) return;
    const card = document.createElement('div');
    card.id = 'kkBlockedClientsCard';
    card.className = 'card mt-4';
    card.innerHTML = `<div class="card-header d-flex justify-content-between align-items-center gap-2"><div><i class="bi bi-slash-circle me-2"></i><strong>Clientes bloqueados</strong></div><button type="button" class="btn btn-outline-secondary btn-sm" id="kkRefreshBlocked"><i class="bi bi-arrow-clockwise"></i></button></div><div class="card-body"><div class="table-responsive"><table class="table table-sm kk-blocked-table"><thead><tr><th>Cliente</th><th>Teléfono</th><th>Motivo</th><th>Fecha</th><th></th></tr></thead><tbody id="kkBlockedClientsBody"><tr><td colspan="5" class="text-muted text-center">Cargando…</td></tr></tbody></table></div></div>`;
    section.append(card);
    document.getElementById('kkRefreshBlocked')?.addEventListener('click', loadBlockedClients);
    loadBlockedClients();
  }

  async function loadBlockedClients() {
    const body = document.getElementById('kkBlockedClientsBody');
    if (!body || !window.db) return;
    try {
      const snapshot = await db.collection('blocked_clients').get();
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => toDate(b.blockedAt) - toDate(a.blockedAt));
      body.innerHTML = list.length ? list.map(item => `<tr><td>${esc(item.name || 'Cliente')}</td><td>${esc(item.phone || '—')}</td><td>${esc(item.reason || '—')}</td><td>${esc(toDate(item.blockedAt).getTime() ? toDate(item.blockedAt).toLocaleString('es-PE') : '—')}</td><td><button type="button" class="btn btn-outline-success btn-sm" data-kk-unblock="${esc(item.id)}"><i class="bi bi-unlock me-1"></i>Desbloquear</button></td></tr>`).join('') : '<tr><td colspan="5" class="text-muted text-center">No hay clientes bloqueados</td></tr>';
      body.querySelectorAll('[data-kk-unblock]').forEach(button => button.addEventListener('click', async () => {
        if (!confirm('¿Desbloquear este cliente?')) return;
        try {
          await db.collection('blocked_clients').doc(button.dataset.kkUnblock).delete();
          notify('Cliente desbloqueado', 'success');
          loadBlockedClients();
        } catch (error) {
          notify(`No se pudo desbloquear: ${error.message}`, 'danger');
        }
      }));
    } catch (error) {
      body.innerHTML = `<tr><td colspan="5" class="text-danger text-center">${esc(error.message)}</td></tr>`;
    }
  }

  function ensureBlockModal() {
    if (document.getElementById('kkBlockClientModal')) return;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `<div class="modal fade" id="kkBlockClientModal" tabindex="-1" aria-hidden="true"><div class="modal-dialog modal-dialog-centered"><div class="modal-content"><div class="modal-header"><h5 class="modal-title"><i class="bi bi-slash-circle me-2"></i>Bloquear cliente</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div><form id="kkBlockClientForm"><div class="modal-body"><p id="kkBlockClientInfo" class="small text-muted"></p><label class="form-label" for="kkBlockReason">Motivo del bloqueo</label><textarea class="form-control" id="kkBlockReason" rows="3" maxlength="240" required></textarea><input type="hidden" id="kkBlockOrderId"></div><div class="modal-footer"><button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button><button type="submit" class="btn btn-danger"><i class="bi bi-slash-circle me-1"></i>Bloquear</button></div></form></div></div></div>`;
    document.body.append(wrapper.firstElementChild);
    document.getElementById('kkBlockClientForm')?.addEventListener('submit', saveBlockedClient);
  }

  function decorateOrderCards() {
    const container = document.getElementById('ordersContainer');
    if (!container || !window.Orders) return;
    const orders = Orders.getFilteredOrders?.() || [];
    [...container.querySelectorAll('.order-card')].forEach((card, index) => {
      const order = orders[index];
      if (!order || card.querySelector('[data-kk-block-client]')) return;
      card.dataset.orderId = order.id;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-outline-danger btn-sm mt-2 w-100';
      button.dataset.kkBlockClient = order.id;
      button.disabled = !normalizePhone(order.customerPhone);
      button.innerHTML = '<i class="bi bi-slash-circle me-1"></i>Bloquear cliente';
      button.title = button.disabled ? 'El pedido no tiene teléfono registrado' : 'Bloquear este cliente';
      button.addEventListener('click', () => openBlockClient(order));
      card.querySelector('.card-body')?.append(button);
    });
  }

  function openBlockClient(order) {
    ensureBlockModal();
    document.getElementById('kkBlockOrderId').value = order.id;
    document.getElementById('kkBlockReason').value = '';
    document.getElementById('kkBlockClientInfo').textContent = `${order.customer || 'Cliente'} · ${order.customerPhone || 'Sin teléfono'}`;
    const modal = document.getElementById('kkBlockClientModal');
    modal.dataset.customerName = order.customer || 'Cliente';
    modal.dataset.customerPhone = normalizePhone(order.customerPhone);
    bootstrap.Modal.getOrCreateInstance(modal).show();
  }

  async function saveBlockedClient(event) {
    event.preventDefault();
    const modal = document.getElementById('kkBlockClientModal');
    const phone = modal?.dataset.customerPhone || '';
    const name = modal?.dataset.customerName || 'Cliente';
    const reason = document.getElementById('kkBlockReason')?.value.trim() || '';
    if (!phone) return notify('El cliente no tiene un teléfono válido', 'warning');
    if (!reason) return notify('Ingresa el motivo del bloqueo', 'warning');
    try {
      const id = `p_${phone}`;
      await db.collection('blocked_clients').doc(id).set({
        phone,
        name,
        reason,
        blockedAt: firebase.firestore.FieldValue.serverTimestamp(),
        blockedBy: getFirebasePhone() || 'admin'
      }, { merge: true });
      bootstrap.Modal.getInstance(modal)?.hide();
      notify('Cliente bloqueado', 'success');
      loadBlockedClients();
    } catch (error) {
      notify(`No se pudo bloquear al cliente: ${error.message}`, 'danger');
    }
  }

  function bindBlockedClients() {
    ensureBlockedClientsPanel();
    ensureBlockModal();
    const container = document.getElementById('ordersContainer');
    if (container && !state.ordersObserver) {
      state.ordersObserver = new MutationObserver(debounce(decorateOrderCards, 30));
      state.ordersObserver.observe(container, { childList: true, subtree: true });
    }
    decorateOrderCards();
  }

  async function loadClientOrdersForReorder() {
    const container = document.getElementById('profileOrdersList');
    if (!container || typeof Auth === 'undefined') return;
    const name = Auth.getClientName?.() || '';
    if (!name || !window.db) return;
    try {
      const snapshot = await db.collection(COLL.orders).where('customer', '==', name).get();
      const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => toDate(b.createdAt) - toDate(a.createdAt)).slice(0, 20);
      window.setTimeout(() => {
        const cards = [...container.querySelectorAll('article.card')];
        cards.forEach((card, index) => {
          const order = orders[index];
          if (!order || card.querySelector('[data-kk-reorder]')) return;
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'btn btn-outline-primary btn-sm mt-2';
          button.dataset.kkReorder = order.id;
          button.innerHTML = '<i class="bi bi-arrow-repeat me-1"></i>Pedir de nuevo';
          button.addEventListener('click', () => reorderPreviousOrder(order));
          card.querySelector('.card-body')?.append(button);
        });
      }, 40);
    } catch (error) {
      console.warn('Pedir de nuevo:', error);
    }
  }

  function productAvailabilityForOrderItem(item) {
    const product = state.products.find(entry => String(entry.id) === String(item.productId || item.id || ''));
    return product && product.active !== false && (product.stock == null || Number(product.stock) > 0) ? product : null;
  }

  function addOrderItemToCart(item, product) {
    const quantity = Math.max(1, Math.trunc(Number(item.qty || 1)));
    if (String(item.name || '') !== String(product.name || '') || Number(item.price) !== Number(product.price)) {
      state.variantCart[product.id] = { name: item.name || product.name, price: Number(item.price ?? product.price), selections: Array.isArray(item.variants) ? item.variants : [], extraPrice: Math.max(0, Number(item.price ?? product.price) - Number(product.price || 0)) };
      writeJson(KEYS.variantCart, state.variantCart);
    }
    window.Cart?.add?.({ ...product, name: item.name || product.name, price: Number(item.price ?? product.price) }, quantity);
  }

  function reorderPreviousOrder(order) {
    const items = Array.isArray(order.items) ? order.items : [];
    const available = [];
    const unavailable = [];
    items.forEach(item => {
      const product = productAvailabilityForOrderItem(item);
      if (product) available.push({ item, product });
      else unavailable.push(item);
    });
    if (!available.length) return notify('Los productos de este pedido ya no están disponibles', 'warning');
    if (!unavailable.length) {
      available.forEach(entry => addOrderItemToCart(entry.item, entry.product));
      notify('¡Pedido anterior agregado al carrito!', 'success');
      return;
    }
    ensureReorderModal();
    const modal = document.getElementById('kkReorderModal');
    modal.dataset.orderId = order.id;
    modal._kkAvailable = available;
    document.getElementById('kkReorderAvailable').innerHTML = available.map(entry => `<li>${esc(entry.item.name)} ×${Number(entry.item.qty || 1)}</li>`).join('');
    document.getElementById('kkReorderUnavailable').innerHTML = unavailable.map(item => `<li>${esc(item.name)} ×${Number(item.qty || 1)}</li>`).join('');
    bootstrap.Modal.getOrCreateInstance(modal).show();
  }

  function ensureReorderModal() {
    if (document.getElementById('kkReorderModal')) return;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `<div class="modal fade" id="kkReorderModal" tabindex="-1" aria-hidden="true"><div class="modal-dialog modal-dialog-centered"><div class="modal-content"><div class="modal-header"><h5 class="modal-title"><i class="bi bi-arrow-repeat me-2"></i>Pedir de nuevo</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div><div class="modal-body"><h6 class="text-success">Disponibles</h6><ul id="kkReorderAvailable"></ul><h6 class="text-danger mt-3">No disponibles</h6><ul id="kkReorderUnavailable"></ul></div><div class="modal-footer"><button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button><button type="button" class="btn btn-primary" id="kkAddAvailableOrder"><i class="bi bi-cart-plus me-1"></i>Agregar solo disponibles</button></div></div></div></div>`;
    document.body.append(wrapper.firstElementChild);
    document.getElementById('kkAddAvailableOrder')?.addEventListener('click', () => {
      const modal = document.getElementById('kkReorderModal');
      const available = Array.isArray(modal?._kkAvailable) ? modal._kkAvailable : [];
      available.forEach(entry => addOrderItemToCart(entry.item, entry.product));
      bootstrap.Modal.getInstance(modal)?.hide();
      notify('Productos disponibles agregados al carrito', 'success');
    });
  }

  function bindReorder() {
    document.querySelectorAll('[data-profile-tab="orders"]').forEach(button => button.addEventListener('click', () => window.setTimeout(loadClientOrdersForReorder, 100)));
  }

  function playOrderBeep() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 800;
      gain.gain.setValueAtTime(0.06, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.2);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.2);
      oscillator.addEventListener('ended', () => context.close().catch(() => {}), { once: true });
    } catch (error) {
      console.debug('Audio de pedido no disponible:', error);
    }
  }

  function alertNewOrder() {
    if (localStorage.getItem(KEYS.vibration) === 'false') return;
    if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
    playOrderBeep();
  }

  function startOrderNotifications() {
    if (!window.auth?.currentUser || !window.db || state.orderNotificationUnsub) return;
    state.orderNotificationPrimed = false;
    state.knownOrderIds.clear();
    state.orderNotificationUnsub = db.collection(COLL.orders).onSnapshot(snapshot => {
      if (!state.orderNotificationPrimed) {
        snapshot.docs.forEach(doc => state.knownOrderIds.add(doc.id));
        state.orderNotificationPrimed = true;
        return;
      }
      snapshot.docChanges().forEach(change => {
        if (change.type !== 'added' || state.knownOrderIds.has(change.doc.id)) return;
        state.knownOrderIds.add(change.doc.id);
        alertNewOrder();
      });
    }, error => console.warn('Notificaciones de pedidos:', error));
  }

  function stopOrderNotifications() {
    if (typeof state.orderNotificationUnsub === 'function') state.orderNotificationUnsub();
    state.orderNotificationUnsub = null;
    state.orderNotificationPrimed = false;
    state.knownOrderIds.clear();
  }

  function ensureSessionsSection() {
    if (document.getElementById('kkSessionsContent')) return;
    const auditSection = document.getElementById('sec-auditoria');
    if (auditSection) {
      const card = document.createElement('div');
      card.className = 'card mt-4';
      card.innerHTML = `<div class="card-header d-flex justify-content-between align-items-center"><strong><i class="bi bi-clock-history me-2"></i>Sesiones</strong><button type="button" class="btn btn-outline-secondary btn-sm" id="kkRefreshSessions"><i class="bi bi-arrow-clockwise"></i></button></div><div class="card-body" id="kkSessionsContent"></div>`;
      auditSection.append(card);
      document.getElementById('kkRefreshSessions')?.addEventListener('click', loadSessions);
      loadSessions();
      return;
    }
    const adminMain = document.querySelector('#page-admin .admin-main');
    const nav = document.querySelector('#page-admin [data-admin-section="apariencia"]')?.parentElement?.parentElement || document.querySelector('#page-admin .admin-nav');
    if (!adminMain || !nav || document.getElementById('sec-sessions')) return;
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'nav-link';
    link.dataset.adminSection = 'sessions';
    link.innerHTML = '<i class="bi bi-clock-history me-2"></i>Sesiones';
    nav.append(link);
    const section = document.createElement('section');
    section.id = 'sec-sessions';
    section.className = 'admin-section';
    section.innerHTML = '<div class="d-flex justify-content-between align-items-center mb-3"><h2 class="h4 mb-0">Sesiones administrativas</h2><button class="btn btn-outline-secondary btn-sm" id="kkRefreshSessions"><i class="bi bi-arrow-clockwise"></i></button></div><div class="card"><div class="card-body" id="kkSessionsContent"></div></div>';
    adminMain.append(section);
    link.addEventListener('click', () => {
      document.querySelectorAll('[data-admin-section]').forEach(item => item.classList.remove('active'));
      link.classList.add('active');
      document.querySelectorAll('.admin-section').forEach(item => item.classList.remove('active'));
      section.classList.add('active');
      loadSessions();
    });
    document.getElementById('kkRefreshSessions')?.addEventListener('click', loadSessions);
    applyPermissionsToAdmin();
  }

  async function loadSessions() {
    const content = document.getElementById('kkSessionsContent');
    if (!content || !window.db) return;
    content.innerHTML = '<div class="text-center py-3"><span class="spinner-border spinner-border-sm"></span></div>';
    try {
      const snapshot = await db.collection('session_log').get();
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => toDate(b.loginAt) - toDate(a.loginAt)).slice(0, 50);
      content.innerHTML = `<div class="table-responsive"><table class="table table-sm kk-session-table"><thead><tr><th>Fecha/Hora</th><th>Teléfono</th><th>Navegador</th><th>Sistema Operativo</th><th>Resolución</th></tr></thead><tbody>${list.length ? list.map(item => `<tr><td>${esc(toDate(item.loginAt).getTime() ? toDate(item.loginAt).toLocaleString('es-PE') : '—')}</td><td><i class="bi ${isMobileUserAgent(item.userAgent) ? 'bi-phone' : 'bi-laptop'} me-1"></i>${esc(item.phone || '—')}</td><td>${esc(browserFromUserAgent(item.userAgent))}</td><td>${esc(osFromUserAgent(item.userAgent))}</td><td>${esc(item.screenResolution || '—')}</td></tr>`).join('') : '<tr><td colspan="5" class="text-center text-muted">Sin sesiones registradas</td></tr>'}</tbody></table></div>`;
    } catch (error) {
      content.innerHTML = `<div class="alert alert-danger mb-0">${esc(error.message)}</div>`;
    }
  }

  function initAdminDynamicEnhancements() {
    ensureAppearancePanel();
    ensureStaffPermissionsEditor();
    ensureBlockedClientsPanel();
    bindBlockedClients();
    decorateStaffTable();
    decorateOrderCards();
    ensureSessionsSection();
    applyPermissionsToAdmin();
  }

  function bindAdminEnhancementEvents() {
    window.addEventListener('admin:products-updated', () => {
      refreshAdminProductSelects();
      applyPermissionsToAdmin();
    });
    document.querySelectorAll('[data-admin-section]').forEach(link => link.addEventListener('click', () => window.setTimeout(initAdminDynamicEnhancements, 30)));
    const observer = new MutationObserver(debounce(() => {
      if (document.body.dataset.page === 'admin' || document.querySelector('#page-admin.active-page')) initAdminDynamicEnhancements();
    }, 80));
    observer.observe(document.getElementById('page-admin') || document.body, { childList: true, subtree: true });
    window.setTimeout(initAdminDynamicEnhancements, 200);
  }

  function isAtTopForPullRefresh() {
    const main = document.querySelector('#page-store .products-main');
    return (window.scrollY || 0) <= 2 && (!main || main.scrollTop <= 2);
  }

  function bindTouchGestures() {
    const maxWidth = () => window.matchMedia('(max-width: 991.98px)').matches;
    const start = (event, context) => {
      if (!maxWidth() || event.touches.length !== 1) return;
      const touch = event.touches[0];
      state.swipe = { context, x: touch.clientX, y: touch.clientY, time: performance.now(), lastX: touch.clientX, lastY: touch.clientY, pullTop: context === 'store' && isAtTopForPullRefresh() };
    };
    const move = event => {
      if (!state.swipe || !maxWidth() || event.touches.length !== 1) return;
      const touch = event.touches[0];
      state.swipe.lastX = touch.clientX;
      state.swipe.lastY = touch.clientY;
      const dx = touch.clientX - state.swipe.x;
      const dy = touch.clientY - state.swipe.y;
      if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy) * 1.25) {
        document.body.classList.add('kk-swipe-feedback');
        document.body.style.setProperty('--kk-swipe-x', `${Math.max(-24, Math.min(24, dx / 4))}px`);
      }
    };
    const end = () => {
      if (!state.swipe || !maxWidth()) return;
      const data = state.swipe;
      state.swipe = null;
      document.body.classList.remove('kk-swipe-feedback');
      document.body.style.removeProperty('--kk-swipe-x');
      const dx = data.lastX - data.x;
      const dy = data.lastY - data.y;
      const duration = performance.now() - data.time;
      const horizontal = Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.25 && duration <= 200;
      if (horizontal) {
        if (data.context === 'store' && dx < 0) bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('cartOffcanvas'))?.show();
        if (data.context === 'cart' && dx > 0) bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('cartOffcanvas'))?.hide();
        if (data.context === 'admin' && dx > 0) bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('adminOffcanvas'))?.show();
        if (data.context === 'admin-menu' && dx < 0) bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('adminOffcanvas'))?.hide();
        return;
      }
      if (data.context === 'store' && data.pullTop && dy > 80 && Math.abs(dx) < 45 && duration <= 450) {
        showPullRefreshSpinner();
        window.Store?.reconnect?.();
      }
    };
    const store = document.getElementById('page-store');
    const cart = document.getElementById('cartOffcanvas');
    const admin = document.getElementById('page-admin');
    const adminMenu = document.getElementById('adminOffcanvas');
    [[store, 'store'], [cart, 'cart'], [admin, 'admin'], [adminMenu, 'admin-menu']].forEach(([element, context]) => {
      element?.addEventListener('touchstart', event => start(event, context), { passive: true });
      element?.addEventListener('touchmove', move, { passive: true });
      element?.addEventListener('touchend', end, { passive: true });
      element?.addEventListener('touchcancel', end, { passive: true });
    });
  }

  function showPullRefreshSpinner() {
    const main = document.querySelector('#page-store .products-main');
    if (!main || document.getElementById('kkPullSpinner')) return;
    const spinner = document.createElement('div');
    spinner.id = 'kkPullSpinner';
    spinner.className = 'position-sticky top-0 start-50 translate-middle-x py-2 text-center';
    spinner.style.zIndex = '1080';
    spinner.innerHTML = '<span class="spinner-border spinner-border-sm text-primary" aria-hidden="true"></span><span class="ms-2 small">Actualizando productos…</span>';
    main.prepend(spinner);
    window.setTimeout(() => spinner.remove(), 900);
  }

  function init() {
    initSplash();
    initLocalPreferences();
    ensureStoreHeaderEnhancements();
    ensureStoreControls();
    observeCatalog();
    bindStoreEvents();
    hydrateFromStore();
    bindOfflineEvents();
    ensureBackToTop();
    bindSchedule();
    bindOffer();
    bindFeatured();
    bindMaintenance();
    bindVariantStoreInterception();
    patchCartForVariantsAndCheckout();
    bindProductAdminEnhancements();
    bindStaffEnhancements();
    bindPermissionGuard();
    bindReorder();
    bindTouchGestures();
    bindAdminEnhancementEvents();
    ensureReorderModal();
    ensureBlockModal();
    updateOfflineUi();
    if (window.auth?.currentUser) {
      resolveAdministrativeAccess(window.auth.currentUser).then(allowed => {
        if (allowed) {
          logAdminSession(window.auth.currentUser);
          startOrderNotifications();
          applyPermissionsToAdmin();
        }
      });
    }
  }

  patchAuthAccess();

  window.KioscoSystem = Object.freeze({
    init,
    applyCatalogEnhancements,
    loadSessions,
    loadBlockedClients,
    handleProductAdd
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
