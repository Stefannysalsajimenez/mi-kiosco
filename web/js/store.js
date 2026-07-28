'use strict';

const Store = (() => {
  const SEARCH_DELAY_MS = 140;
  const collator = new Intl.Collator('es', {
    sensitivity: 'base',
    numeric: true
  });

  let categories = [];
  let products = [];
  let activeCategoryId = null;
  let activeSubcategoryId = null;
  let searchQuery = '';
  let unsubscribeCategories = null;
  let unsubscribeProducts = null;
  let initialized = false;
  let listenersBound = false;
  let categoriesLoaded = false;
  let productsLoaded = false;
  let searchTimer = null;
  let renderFrame = null;
  const imageUrlCache = new Map();

  function notify(message, type = 'info') {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
      return;
    }

    console.info(`[Store:${type}] ${message}`);
  }

  function getDatabase() {
    if (window.db) return window.db;
    if (typeof db !== 'undefined') return db;
    return null;
  }

  function getCollections() {
    if (window.COLL) return window.COLL;
    if (typeof COLL !== 'undefined') return COLL;
    return null;
  }

  function getCart() {
    if (window.Cart) return window.Cart;
    if (typeof Cart !== 'undefined') return Cart;
    return null;
  }

  function getCurrency() {
    return window.APP_CONFIG?.currency ||
      (typeof APP_CONFIG !== 'undefined' ? APP_CONFIG.currency : 'S/');
  }

  function formatMoney(value) {
    const amount = Number(value);
    return `${getCurrency()} ${Number.isFinite(amount) ? amount.toFixed(2) : '0.00'}`;
  }

  function normalizeSearch(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es')
      .trim();
  }

  function normalizeId(value) {
    return String(value ?? '').trim();
  }

  function normalizeStock(value) {
    if (value === null || value === undefined || value === '') return null;
    const stock = Math.trunc(Number(value));
    return Number.isFinite(stock) && stock >= 0 ? stock : null;
  }

  function normalizePrice(value) {
    const price = Number(value);
    return Number.isFinite(price) && price >= 0 ? price : 0;
  }

  function normalizeCategory(documentSnapshot) {
    const data = documentSnapshot.data() || {};
    return {
      id: normalizeId(documentSnapshot.id),
      name: String(data.name || 'Sin nombre').trim(),
      emoji: String(data.emoji || '').trim(),
      parentId: normalizeId(data.parentId) || null,
      active: data.active !== false
    };
  }

  function normalizeProduct(documentSnapshot) {
    const data = documentSnapshot.data() || {};
    return {
      ...data,
      id: normalizeId(documentSnapshot.id),
      name: String(data.name || 'Producto sin nombre').trim(),
      description: String(data.description || '').trim(),
      price: normalizePrice(data.price),
      stock: normalizeStock(data.stock),
      unit: String(data.unit || 'Unidad').trim() || 'Unidad',
      discountPercent: Math.max(0, Math.min(100, Number(data.discountPercent || 0))),
      imagePath: data.imagePath ? String(data.imagePath).trim() : null,
      imageUrl: data.imageUrl ? String(data.imageUrl).trim() : null,
      resolvedImageUrl: null,
      categoryId: normalizeId(data.categoryId) || null,
      subcategoryId: normalizeId(data.subcategoryId) || null,
      active: data.active !== false
    };
  }

  async function resolveProductImage(product) {
    const legacyUrl = normalizeImageUrl(product.imageUrl);
    if (legacyUrl) return { ...product, resolvedImageUrl: legacyUrl };
    if (!product.imagePath || !window.storage) return product;

    try {
      if (!imageUrlCache.has(product.imagePath)) {
        imageUrlCache.set(product.imagePath, window.storage.ref(product.imagePath).getDownloadURL());
      }
      const resolvedImageUrl = await imageUrlCache.get(product.imagePath);
      return { ...product, resolvedImageUrl };
    } catch (error) {
      imageUrlCache.delete(product.imagePath);
      console.warn('No se pudo obtener la imagen del producto:', product.imagePath, error?.message || error);
      return product;
    }
  }

  function normalizeImageUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;

    if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(raw)) return raw;
    if (/^blob:/i.test(raw)) return raw;

    try {
      const url = new URL(raw, window.location.href);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
    } catch (error) {
      console.warn('URL de imagen inválida:', raw, error);
    }

    return null;
  }

  function sortByName(list) {
    return list.sort((a, b) => collator.compare(a.name || '', b.name || ''));
  }

  function setGridBusy(isBusy) {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;
    grid.setAttribute('aria-busy', String(isBusy));
  }

  function createStatusColumn(icon, message, className = 'text-muted', action = null) {
    const column = document.createElement('div');
    column.className = 'col-12 text-center py-5 store-status';

    const iconElement = document.createElement('i');
    iconElement.className = `bi bi-${icon} display-4 ${className}`;
    iconElement.setAttribute('aria-hidden', 'true');

    const paragraph = document.createElement('p');
    paragraph.className = `mt-3 mb-0 ${className}`;
    paragraph.textContent = message;

    column.append(iconElement, paragraph);

    if (action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-outline-primary btn-sm mt-3';
      button.dataset.storeAction = action.name;
      button.innerHTML = `<i class="bi bi-arrow-clockwise me-1" aria-hidden="true"></i>${action.label}`;
      column.append(button);
    }

    return column;
  }

  function showProductsLoading() {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;

    setGridBusy(true);
    const column = document.createElement('div');
    column.className = 'col-12 text-center py-5 store-status';
    column.innerHTML = `
      <div class="spinner-border text-primary" role="status" aria-label="Cargando productos"></div>
      <p class="mt-3 mb-0 text-muted small">Cargando productos…</p>`;
    grid.replaceChildren(column);
  }

  function showProductsError(error) {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;

    setGridBusy(false);
    const code = String(error?.code || '').replace(/^firestore\//, '');
    const message = code === 'permission-denied'
      ? 'No tienes permiso para consultar los productos.'
      : 'No se pudieron cargar los productos.';

    grid.replaceChildren(createStatusColumn(
      'exclamation-triangle',
      message,
      'text-danger',
      { name: 'retry', label: 'Reintentar' }
    ));
  }

  function reconcileSelection() {
    const activeCategoryExists = activeCategoryId && categories.some(category => category.id === activeCategoryId);
    const activeSubcategoryExists = activeSubcategoryId && categories.some(category => category.id === activeSubcategoryId);

    if (activeCategoryId && !activeCategoryExists) activeCategoryId = null;
    if (activeSubcategoryId && !activeSubcategoryExists) activeSubcategoryId = null;

    if (activeSubcategoryId) {
      const subcategory = categories.find(category => category.id === activeSubcategoryId);
      activeCategoryId = subcategory?.parentId || activeCategoryId;
    }
  }

  function subscribeCategories() {
    if (typeof unsubscribeCategories === 'function') unsubscribeCategories();

    const database = getDatabase();
    const collections = getCollections();

    if (!database || !collections?.categories) {
      categoriesLoaded = true;
      categories = [];
      renderCategories();
      console.warn('Colección de categorías no configurada');
      return;
    }

    unsubscribeCategories = database.collection(collections.categories).onSnapshot(snapshot => {
      categories = sortByName(
        snapshot.docs
          .map(normalizeCategory)
          .filter(category => category.id && category.active)
      );
      categoriesLoaded = true;
      reconcileSelection();
      renderCategories();
      scheduleProductsRender();
      window.dispatchEvent(new CustomEvent('store:categories-updated', {
        detail: { categories: getCategories() }
      }));
    }, error => {
      categoriesLoaded = true;
      console.warn('Error al cargar categorías:', error?.code || error);
      renderCategories();
      notify('No se pudieron actualizar las categorías', 'warning');
    });
  }

  function subscribeProducts() {
    if (typeof unsubscribeProducts === 'function') unsubscribeProducts();

    const database = getDatabase();
    const collections = getCollections();

    if (!database || !collections?.products) {
      productsLoaded = true;
      products = [];
      showProductsError(new Error('Firestore no está configurado'));
      return;
    }

    productsLoaded = false;
    showProductsLoading();

    unsubscribeProducts = database
      .collection(collections.products)
      .where('active', '==', true)
      .onSnapshot(async snapshot => {
        const normalizedProducts = snapshot.docs
          .map(normalizeProduct)
          .filter(product => product.id && product.active);
        products = sortByName(await Promise.all(normalizedProducts.map(resolveProductImage)));
        productsLoaded = true;
        getCart()?.syncProducts?.(products);
        scheduleProductsRender();
        window.dispatchEvent(new CustomEvent('store:products-updated', {
          detail: { products: getProducts() }
        }));
      }, error => {
        productsLoaded = true;
        console.warn('Error al cargar productos:', error?.code || error, error?.message || '');
        showProductsError(error);
      });
  }

  function connect() {
    subscribeCategories();
    subscribeProducts();
  }

  function createCategoryIcon(category, isSubcategory = false) {
    const icon = document.createElement('span');
    icon.className = 'me-2 flex-shrink-0';

    if (category?.emoji) {
      icon.textContent = category.emoji;
      icon.setAttribute('aria-hidden', 'true');
      return icon;
    }

    const bootstrapIcon = document.createElement('i');
    bootstrapIcon.className = `bi bi-${isSubcategory ? 'arrow-return-right' : 'tag'}`;
    bootstrapIcon.setAttribute('aria-hidden', 'true');
    icon.append(bootstrapIcon);
    return icon;
  }

  function createCategoryLink(category = null, parentId = null) {
    const isAll = !category;
    const isSubcategory = Boolean(category?.parentId);
    const categoryId = isAll ? '' : (parentId || category.id);
    const subcategoryId = isSubcategory ? category.id : '';
    const isActive = isAll
      ? !activeCategoryId && !activeSubcategoryId
      : isSubcategory
        ? activeSubcategoryId === category.id
        : activeCategoryId === category.id && !activeSubcategoryId;

    const item = document.createElement('li');
    item.className = 'nav-item';

    const link = document.createElement('a');
    link.href = '#';
    link.className = `nav-link cat-link${isSubcategory ? ' subcat-link' : ''}${isActive ? ' active' : ''}`;
    link.dataset.storeCategory = 'true';
    link.dataset.cat = categoryId;
    link.dataset.sub = subcategoryId;
    link.setAttribute('aria-current', isActive ? 'page' : 'false');

    if (isAll) {
      const icon = document.createElement('i');
      icon.className = 'bi bi-grid-fill me-2';
      icon.setAttribute('aria-hidden', 'true');
      link.append(icon, document.createTextNode('Todos'));
    } else {
      link.append(createCategoryIcon(category, isSubcategory), document.createTextNode(category.name));
    }

    item.append(link);
    return item;
  }

  function buildCategoryMenu() {
    const fragment = document.createDocumentFragment();
    const mainCategories = categories.filter(category => !category.parentId);
    const subcategories = categories.filter(category => category.parentId);

    fragment.append(createCategoryLink());

    mainCategories.forEach(category => {
      const item = createCategoryLink(category);
      const children = subcategories.filter(subcategory => subcategory.parentId === category.id);

      if (children.length) {
        const nested = document.createElement('ul');
        nested.className = 'nav flex-column ms-3';
        children.forEach(subcategory => nested.append(createCategoryLink(subcategory, category.id)));
        item.append(nested);
      }

      fragment.append(item);
    });

    return fragment;
  }

  function renderCategoryMenu(element) {
    if (!element) return;
    element.replaceChildren(buildCategoryMenu());
  }

  function renderCategories() {
    renderCategoryMenu(document.getElementById('categoryList'));
    renderCategoryMenu(document.getElementById('categoryListMobile'));
    updateCategoryTitle();
  }

  function updateCategoryTitle() {
    const title = document.getElementById('currentCatTitle');
    if (!title) return;

    const selected = activeSubcategoryId
      ? categories.find(category => category.id === activeSubcategoryId)
      : categories.find(category => category.id === activeCategoryId);

    title.textContent = selected?.name || 'Todos los productos';
  }

  function getCategoryName(categoryId) {
    return categories.find(category => category.id === categoryId)?.name || '';
  }

  function productMatchesSearch(product) {
    if (!searchQuery) return true;

    const searchable = normalizeSearch([
      product.name,
      product.description,
      getCategoryName(product.categoryId),
      getCategoryName(product.subcategoryId)
    ].filter(Boolean).join(' '));

    return searchable.includes(searchQuery);
  }

  function getVisibleProducts() {
    let result = products;

    if (activeSubcategoryId) {
      result = result.filter(product => product.subcategoryId === activeSubcategoryId);
    } else if (activeCategoryId) {
      const childIds = new Set(
        categories
          .filter(category => category.parentId === activeCategoryId)
          .map(category => category.id)
      );

      result = result.filter(product =>
        product.categoryId === activeCategoryId || childIds.has(product.subcategoryId)
      );
    }

    if (searchQuery) result = result.filter(productMatchesSearch);
    return result;
  }

  function createImagePlaceholder() {
    const placeholder = document.createElement('div');
    placeholder.className = 'prod-img-placeholder d-flex align-items-center justify-content-center h-100';
    placeholder.innerHTML = '<i class="bi bi-bag display-4 text-muted" aria-hidden="true"></i>';
    return placeholder;
  }

  function createProductImage(product) {
    const imageUrl = normalizeImageUrl(product.resolvedImageUrl || product.imageUrl);
    if (!imageUrl) return createImagePlaceholder();

    const image = document.createElement('img');
    image.src = imageUrl;
    image.alt = product.name;
    image.className = 'card-img-top prod-img';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.addEventListener('error', () => {
      image.replaceWith(createImagePlaceholder());
    }, { once: true });
    return image;
  }

  function toDate(value) {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function isNewProduct(product) {
    const createdAt = toDate(product.createdAt);
    if (!createdAt) return false;
    return Date.now() - createdAt.getTime() <= 14 * 24 * 60 * 60 * 1000;
  }

  function createProductLabels(product) {
    const labels = document.createElement('div');
    labels.className = 'product-labels position-absolute top-0 start-0 m-2 d-flex flex-column align-items-start gap-1';

    if (product.stock !== null && product.stock <= 0) {
      const soldOut = document.createElement('span');
      soldOut.className = 'badge bg-secondary';
      soldOut.textContent = 'Agotado';
      labels.append(soldOut);
    }

    if (product.discountPercent > 0 && product.stock !== 0) {
      const discount = document.createElement('span');
      discount.className = 'badge bg-danger';
      discount.textContent = `Descuento ${product.discountPercent}%`;
      labels.append(discount);
    }

    if (isNewProduct(product) && product.stock !== 0) {
      const recent = document.createElement('span');
      recent.className = 'badge bg-primary';
      recent.textContent = 'Nuevo';
      labels.append(recent);
    }

    return labels.childElementCount ? labels : null;
  }

  function createStockBadge(product) {
    if (product.stock === null || product.stock <= 0 || product.stock > 5) return null;
    const badge = document.createElement('span');
    badge.className = 'badge position-absolute top-0 end-0 m-2 stock-badge bg-danger';
    badge.textContent = `Últimos ${product.stock}`;
    return badge;
  }

  function createActionButton(action, product, options = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.storeAction = action;
    button.dataset.productId = product.id;
    button.className = options.className || 'btn btn-outline-secondary btn-sm';
    button.disabled = Boolean(options.disabled);
    button.title = options.label || '';
    button.setAttribute('aria-label', options.label || 'Acción de producto');
    button.innerHTML = options.html || '';
    return button;
  }

  function createQuantityControl(product, quantity) {
    const group = document.createElement('div');
    group.className = 'input-group input-group-sm qty-ctrl w-100';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', `Cantidad de ${product.name}`);

    const decrease = createActionButton('decrease', product, {
      className: 'btn btn-outline-secondary btn-dec',
      label: `Disminuir ${product.name}`,
      html: '<i class="bi bi-dash" aria-hidden="true"></i>'
    });

    const value = document.createElement('input');
    value.type = 'number';
    value.inputMode = 'numeric';
    value.className = 'form-control form-control-sm qty-val text-center';
    value.dataset.storeQtyInput = 'true';
    value.dataset.productId = product.id;
    value.min = '1';
    value.max = String(product.stock === null ? 999 : product.stock);
    value.value = String(quantity);
    value.setAttribute('aria-label', `Cantidad de ${product.name}`);

    const stockReached = product.stock !== null && quantity >= product.stock;
    const increase = createActionButton('increase', product, {
      className: 'btn btn-outline-secondary btn-inc',
      disabled: stockReached,
      label: stockReached ? `Stock máximo de ${product.name}` : `Aumentar ${product.name}`,
      html: '<i class="bi bi-plus" aria-hidden="true"></i>'
    });

    group.append(decrease, value, increase);
    return group;
  }

  function createAddButton(product) {
    const soldOut = product.stock !== null && product.stock <= 0;
    return createActionButton('add', product, {
      className: `btn btn-sm w-100 ${soldOut ? 'btn-outline-secondary' : 'btn-primary'} btn-add`,
      disabled: soldOut,
      label: soldOut ? `${product.name} agotado` : `Agregar ${product.name} al carrito`,
      html: soldOut
        ? '<i class="bi bi-slash-circle me-1" aria-hidden="true"></i>Agotado'
        : '<i class="bi bi-cart-plus me-1" aria-hidden="true"></i>Agregar'
    });
  }

  function createProductCard(product) {
    const cart = getCart();
    const quantity = cart?.qty?.(product.id) || 0;

    const column = document.createElement('div');
    column.className = 'col';

    const card = document.createElement('article');
    card.className = 'card h-100 prod-card';
    card.dataset.productId = product.id;

    const imageWrap = document.createElement('div');
    imageWrap.className = 'prod-img-wrap position-relative';
    imageWrap.append(createProductImage(product));

    const productLabels = createProductLabels(product);
    if (productLabels) imageWrap.append(productLabels);

    const stockBadge = createStockBadge(product);
    if (stockBadge) imageWrap.append(stockBadge);

    const body = document.createElement('div');
    body.className = 'card-body d-flex flex-column p-3';

    const name = document.createElement('h3');
    name.className = 'card-title prod-name mb-1 h6';
    name.textContent = product.name;

    body.append(name);

    if (product.description) {
      const description = document.createElement('p');
      description.className = 'card-text prod-desc text-muted small mb-2';
      description.textContent = product.description;
      body.append(description);
    }

    const bottom = document.createElement('div');
    bottom.className = 'mt-auto';

    const priceRow = document.createElement('div');
    priceRow.className = 'd-flex align-items-center justify-content-between gap-2 mb-2';

    const price = document.createElement('span');
    price.className = 'prod-price fw-bold';
    price.textContent = `${formatMoney(product.price)} / ${product.unit}`;

    priceRow.append(price);

    if (product.stock !== null) {
      const stock = document.createElement('small');
      stock.className = product.stock <= 0 ? 'text-danger' : 'text-muted';
      stock.textContent = `Disponible: ${Math.max(product.stock - quantity, 0)}`;
      priceRow.append(stock);
    }

    bottom.append(priceRow);
    bottom.append(quantity > 0 ? createQuantityControl(product, quantity) : createAddButton(product));
    body.append(bottom);
    card.append(imageWrap, body);
    column.append(card);

    return column;
  }

  function renderProducts() {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;

    if (!productsLoaded) {
      showProductsLoading();
      return;
    }

    setGridBusy(false);
    const visibleProducts = getVisibleProducts();

    if (!visibleProducts.length) {
      const message = products.length
        ? 'No se encontraron productos con los filtros actuales.'
        : 'No hay productos disponibles.';
      grid.replaceChildren(createStatusColumn('search', message));
      return;
    }

    const fragment = document.createDocumentFragment();
    visibleProducts.forEach(product => fragment.append(createProductCard(product)));
    grid.replaceChildren(fragment);
  }

  function scheduleProductsRender() {
    if (renderFrame !== null) window.cancelAnimationFrame(renderFrame);
    renderFrame = window.requestAnimationFrame(() => {
      renderFrame = null;
      renderProducts();
    });
  }

  function selectCategory(categoryId, subcategoryId = null) {
    activeCategoryId = normalizeId(categoryId) || null;
    activeSubcategoryId = normalizeId(subcategoryId) || null;

    if (activeSubcategoryId) {
      const subcategory = categories.find(category => category.id === activeSubcategoryId);
      activeCategoryId = subcategory?.parentId || activeCategoryId;
    }

    renderCategories();
    scheduleProductsRender();

    window.dispatchEvent(new CustomEvent('store:filter-changed', {
      detail: {
        categoryId: activeCategoryId,
        subcategoryId: activeSubcategoryId,
        search: searchQuery
      }
    }));
  }

  function handleCategoryClick(event) {
    const link = event.target.closest('[data-store-category]');
    if (!link) return false;
    if (!link.closest('#categoryList, #categoryListMobile')) return false;

    event.preventDefault();
    event.stopPropagation();
    selectCategory(link.dataset.cat, link.dataset.sub);

    const mobilePanel = link.closest('#categoryOffcanvas');
    if (mobilePanel && typeof bootstrap !== 'undefined') {
      bootstrap.Offcanvas.getInstance(mobilePanel)?.hide();
    }

    return true;
  }

  function handleProductAction(event) {
    const button = event.target.closest('[data-store-action]');
    if (!button) return false;

    if (button.dataset.storeAction === 'retry') {
      event.preventDefault();
      connect();
      return true;
    }

    if (!button.closest('#productsGrid')) return false;

    event.preventDefault();
    const productId = normalizeId(button.dataset.productId);
    const product = products.find(item => item.id === productId);
    const cart = getCart();

    if (!product || !cart) {
      notify('No se pudo procesar el producto', 'warning');
      return true;
    }

    const action = button.dataset.storeAction;
    if (action === 'add' || action === 'increase') cart.add(product);
    if (action === 'decrease') cart.remove(product.id);

    return true;
  }

  function handleDocumentClick(event) {
    if (handleCategoryClick(event)) return;
    handleProductAction(event);
  }

  function handleQuantityChange(event) {
    const input = event.target.closest('[data-store-qty-input]');
    if (!input || !input.closest('#productsGrid')) return;
    getCart()?.setQty?.(input.dataset.productId, input.value);
  }

  function handleQuantityKeydown(event) {
    const input = event.target.closest('[data-store-qty-input]');
    if (!input || event.key !== 'Enter') return;
    event.preventDefault();
    input.blur();
  }

  function handleSearchInput(event) {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      searchQuery = normalizeSearch(event.target.value);
      scheduleProductsRender();
    }, SEARCH_DELAY_MS);
  }

  function handleSearchKeydown(event) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.target.value = '';
    searchQuery = '';
    scheduleProductsRender();
  }

  function bindEvents() {
    if (listenersBound) return;
    listenersBound = true;

    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('change', handleQuantityChange);
    document.addEventListener('keydown', handleQuantityKeydown);

    const searchInput = document.getElementById('searchInput');
    searchInput?.addEventListener('input', handleSearchInput);
    searchInput?.addEventListener('keydown', handleSearchKeydown);

    window.addEventListener('cart:updated', scheduleProductsRender);
    window.addEventListener('online', () => {
      notify('Conexión restablecida', 'success');
    });
    window.addEventListener('offline', () => {
      notify('Sin conexión. Se mostrarán los datos disponibles.', 'warning');
    });
  }

  function init() {
    bindEvents();

    if (initialized) {
      renderCategories();
      scheduleProductsRender();
      return;
    }

    initialized = true;
    categoriesLoaded = false;
    productsLoaded = false;
    connect();
  }

  function refreshCards() {
    scheduleProductsRender();
  }

  function refresh() {
    renderCategories();
    scheduleProductsRender();
  }

  function reconnect() {
    connect();
  }

  function destroy() {
    if (typeof unsubscribeCategories === 'function') unsubscribeCategories();
    if (typeof unsubscribeProducts === 'function') unsubscribeProducts();
    unsubscribeCategories = null;
    unsubscribeProducts = null;
    initialized = false;
  }

  function getProducts() {
    return products.map(product => ({ ...product }));
  }

  function getCategories() {
    return categories.map(category => ({ ...category }));
  }

  function getState() {
    return {
      activeCategoryId,
      activeSubcategoryId,
      searchQuery,
      categoriesLoaded,
      productsLoaded
    };
  }

  return {
    init,
    refresh,
    reconnect,
    destroy,
    refreshCards,
    selectCategory,
    getProducts,
    getCategories,
    getState
  };
})();

window.Store = Store;
