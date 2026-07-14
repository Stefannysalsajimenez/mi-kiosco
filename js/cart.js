// js/cart.js
'use strict';

const Cart = (() => {
  const STORAGE_KEY = 'kk_cart';
  const MAX_QTY_PER_ITEM = 999;

  let items = [];
  let initialized = false;
  let checkoutInProgress = false;

  function notify(message, type = 'info') {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
      return;
    }

    if (typeof showToast === 'function') {
      showToast(message, type);
      return;
    }

    console.info(`[Cart:${type}] ${message}`);
  }

  function normalizeId(value) {
    return String(value ?? '').trim();
  }

  function normalizePrice(value) {
    const price = Number(value);
    return Number.isFinite(price) && price >= 0 ? price : 0;
  }

  function normalizeQty(value) {
    const qty = Math.trunc(Number(value));
    if (!Number.isFinite(qty) || qty < 1) return 1;
    return Math.min(qty, MAX_QTY_PER_ITEM);
  }

  function normalizeStock(value) {
    if (value === null || value === undefined || value === '') return null;
    const stock = Math.trunc(Number(value));
    return Number.isFinite(stock) && stock >= 0 ? stock : null;
  }

  function normalizeItem(item) {
    if (!item || typeof item !== 'object') return null;

    const id = normalizeId(item.id ?? item.productId);
    const name = String(item.name ?? '').trim();
    const price = normalizePrice(item.price);
    const qty = normalizeQty(item.qty);
    const stock = normalizeStock(item.stock);

    if (!id || !name) return null;

    return {
      id,
      name,
      price,
      imageUrl: item.imageUrl ? String(item.imageUrl) : null,
      qty: stock === null ? qty : Math.min(qty, Math.max(stock, 1)),
      stock
    };
  }

  function sanitizeItems(rawItems) {
    if (!Array.isArray(rawItems)) return [];

    const merged = new Map();

    rawItems.forEach(rawItem => {
      const item = normalizeItem(rawItem);
      if (!item) return;

      const existing = merged.get(item.id);
      if (!existing) {
        merged.set(item.id, item);
        return;
      }

      existing.qty = Math.min(
        existing.qty + item.qty,
        existing.stock === null ? MAX_QTY_PER_ITEM : Math.max(existing.stock, 1)
      );

      if (!existing.imageUrl && item.imageUrl) existing.imageUrl = item.imageUrl;
      if (existing.stock === null && item.stock !== null) existing.stock = item.stock;
    });

    return Array.from(merged.values()).filter(item => item.stock !== 0);
  }

  function load() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      items = sanitizeItems(stored);
      save(false);
    } catch (error) {
      console.warn('No se pudo leer el carrito guardado:', error);
      items = [];
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  function save(emit = true) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
      console.warn('No se pudo guardar el carrito:', error);
      notify('No se pudo guardar el carrito en este navegador', 'warning');
    }

    if (emit) dispatchUpdate();
  }

  function dispatchUpdate() {
    window.dispatchEvent(new CustomEvent('cart:updated', {
      detail: {
        count: count(),
        total: total(),
        items: getItems()
      }
    }));
  }

  function refreshStoreCards() {
    try {
      if (window.Store && typeof window.Store.refreshCards === 'function') {
        window.Store.refreshCards();
      } else if (typeof Store !== 'undefined' && typeof Store.refreshCards === 'function') {
        Store.refreshCards();
      }
    } catch (error) {
      console.warn('No se pudieron actualizar las tarjetas de productos:', error);
    }
  }

  function persistAndRender() {
    save();
    render();
    refreshStoreCards();
  }

  function getItem(id) {
    const normalizedId = normalizeId(id);
    return items.find(item => item.id === normalizedId) || null;
  }

  function add(product, amount = 1) {
    const normalized = normalizeItem({ ...product, qty: 1 });
    if (!normalized) {
      notify('No se pudo agregar el producto', 'warning');
      return false;
    }

    const increment = Math.max(1, Math.trunc(Number(amount)) || 1);
    const existing = getItem(normalized.id);
    const stock = normalizeStock(product.stock ?? existing?.stock);
    const currentQty = existing?.qty || 0;
    const limit = stock === null ? MAX_QTY_PER_ITEM : stock;

    if (limit <= 0) {
      notify('Producto sin stock disponible', 'warning');
      return false;
    }

    if (currentQty >= limit) {
      notify(`Stock máximo disponible: ${limit}`, 'warning');
      return false;
    }

    const nextQty = Math.min(currentQty + increment, limit, MAX_QTY_PER_ITEM);

    if (existing) {
      existing.qty = nextQty;
      existing.name = normalized.name;
      existing.price = normalized.price;
      existing.imageUrl = normalized.imageUrl;
      existing.stock = stock;
    } else {
      items.push({
        ...normalized,
        qty: Math.min(increment, limit, MAX_QTY_PER_ITEM),
        stock
      });
    }

    persistAndRender();
    return true;
  }

  function remove(id, amount = 1) {
    const normalizedId = normalizeId(id);
    const index = items.findIndex(item => item.id === normalizedId);
    if (index < 0) return false;

    const decrement = Math.max(1, Math.trunc(Number(amount)) || 1);
    items[index].qty -= decrement;

    if (items[index].qty <= 0) items.splice(index, 1);

    persistAndRender();
    return true;
  }

  function removeAll(id) {
    const normalizedId = normalizeId(id);
    const previousLength = items.length;
    items = items.filter(item => item.id !== normalizedId);

    if (items.length === previousLength) return false;

    persistAndRender();
    return true;
  }

  function clear(options = {}) {
    const { confirmFirst = false } = options;

    if (!items.length) return false;
    if (confirmFirst && !window.confirm('¿Deseas vaciar el carrito?')) return false;

    items = [];
    persistAndRender();
    return true;
  }

  function qty(id) {
    return getItem(id)?.qty || 0;
  }

  function subtotal(id) {
    const item = getItem(id);
    return item ? item.price * item.qty : 0;
  }

  function total() {
    return items.reduce((sum, item) => sum + (item.price * item.qty), 0);
  }

  function count() {
    return items.reduce((sum, item) => sum + item.qty, 0);
  }

  function getItems() {
    return items.map(item => ({ ...item }));
  }

  function getCurrency() {
    return window.APP_CONFIG?.currency || (typeof APP_CONFIG !== 'undefined' ? APP_CONFIG.currency : 'S/');
  }

  function formatMoney(value) {
    return `${getCurrency()} ${Number(value || 0).toFixed(2)}`;
  }

  function createImage(item) {
    if (item.imageUrl) {
      const image = document.createElement('img');
      image.className = 'cart-item-img';
      image.width = 48;
      image.height = 48;
      image.loading = 'lazy';
      image.alt = item.name;
      image.src = item.imageUrl;
      image.addEventListener('error', () => image.replaceWith(createPlaceholder()));
      return image;
    }

    return createPlaceholder();
  }

  function createPlaceholder() {
    const placeholder = document.createElement('div');
    placeholder.className = 'cart-item-img-ph bg-secondary d-flex align-items-center justify-content-center';
    placeholder.style.width = '48px';
    placeholder.style.height = '48px';
    placeholder.innerHTML = '<i class="bi bi-bag text-white" aria-hidden="true"></i>';
    return placeholder;
  }

  function createActionButton(action, id, icon, label, className) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn btn-xs cart-action ${className}`;
    button.dataset.cartAction = action;
    button.dataset.productId = id;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = `<i class="bi bi-${icon}" aria-hidden="true"></i>`;
    return button;
  }

  function createCartItem(item) {
    const row = document.createElement('div');
    row.className = 'cart-item d-flex align-items-center gap-2 py-2 border-bottom';
    row.dataset.productId = item.id;

    row.appendChild(createImage(item));

    const details = document.createElement('div');
    details.className = 'flex-grow-1 min-width-0';

    const name = document.createElement('div');
    name.className = 'fw-semibold small text-truncate';
    name.textContent = item.name;

    const unitPrice = document.createElement('div');
    unitPrice.className = 'text-muted small';
    unitPrice.textContent = `${formatMoney(item.price)} c/u`;

    const itemSubtotal = document.createElement('div');
    itemSubtotal.className = 'small fw-semibold';
    itemSubtotal.textContent = `Subtotal: ${formatMoney(item.price * item.qty)}`;

    details.append(name, unitPrice, itemSubtotal);

    const controls = document.createElement('div');
    controls.className = 'd-flex align-items-center gap-1 flex-shrink-0';

    const decrease = createActionButton('decrease', item.id, 'dash', `Disminuir ${item.name}`, 'btn-outline-secondary p-0 px-1');

    const quantity = document.createElement('span');
    quantity.className = 'small fw-bold px-1 cart-item-qty';
    quantity.textContent = item.qty;
    quantity.setAttribute('aria-label', `Cantidad ${item.qty}`);

    const increase = createActionButton('increase', item.id, 'plus', `Aumentar ${item.name}`, 'btn-outline-secondary p-0 px-1');
    if (item.stock !== null && item.qty >= item.stock) increase.disabled = true;

    const removeButton = createActionButton('remove', item.id, 'trash', `Eliminar ${item.name}`, 'btn-outline-danger p-0 px-1 ms-1');

    controls.append(decrease, quantity, increase, removeButton);
    row.append(details, controls);

    return row;
  }

  function renderList(listElement) {
    if (!listElement) return;

    listElement.replaceChildren();
    items.forEach(item => listElement.appendChild(createCartItem(item)));
  }

  function toggleElement(element, visible, display = '') {
    if (!element) return;
    element.hidden = !visible;
    element.style.display = visible ? display : 'none';
  }

  function updateTotals() {
    const value = formatMoney(total());
    ['cartTotal', 'cartTotalMobile'].forEach(id => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    });
  }

  function updateCartCount() {
    const value = count();
    document.querySelectorAll('.cart-count').forEach(element => {
      element.textContent = String(value);
      toggleElement(element, value > 0, 'inline-flex');
      element.setAttribute('aria-label', `${value} producto${value === 1 ? '' : 's'} en el carrito`);
    });
  }

  function updateEmptyStates() {
    const hasItems = items.length > 0;

    toggleElement(document.getElementById('cartEmpty'), !hasItems, 'block');
    toggleElement(document.getElementById('cartEmptyMobile'), !hasItems, 'block');
    toggleElement(document.getElementById('cartFooter'), hasItems, 'block');

    const mobileFooter = document.getElementById('sendOrderBtnMobile')?.closest('.border-top');
    toggleElement(mobileFooter, hasItems, 'block');

    const clearDesktop = document.getElementById('clearCartBtn');
    if (clearDesktop) clearDesktop.disabled = !hasItems;

    const clearMobile = document.getElementById('clearCartBtnMobile');
    if (clearMobile) clearMobile.disabled = !hasItems;

    ['sendOrderBtn', 'sendOrderBtnMobile', 'shareWhatsappBtn'].forEach(id => {
      const button = document.getElementById(id);
      if (button) button.disabled = !hasItems;
    });
  }

  function render() {
    updateCartCount();
    renderList(document.getElementById('cartItemsList'));
    renderList(document.getElementById('cartItemsListMobile'));
    updateTotals();
    updateEmptyStates();
  }

  function ensureMobileClearButton() {
    const header = document.querySelector('#cartOffcanvas .offcanvas-header');
    if (!header || document.getElementById('clearCartBtnMobile')) return;

    const closeButton = header.querySelector('[data-bs-dismiss="offcanvas"]');
    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.id = 'clearCartBtnMobile';
    clearButton.className = 'btn btn-link btn-sm text-muted text-decoration-none ms-auto me-2';
    clearButton.textContent = 'Limpiar';
    clearButton.disabled = !items.length;

    header.insertBefore(clearButton, closeButton || null);
  }

  function handleAction(event) {
    const button = event.target.closest('[data-cart-action]');
    if (!button) return;

    const id = button.dataset.productId;
    const action = button.dataset.cartAction;

    if (action === 'increase') {
      const item = getItem(id);
      if (item) add(item);
    } else if (action === 'decrease') {
      remove(id);
    } else if (action === 'remove') {
      removeAll(id);
    }
  }

  function bindEvents() {
    document.addEventListener('click', handleAction);

    document.getElementById('clearCartBtn')?.addEventListener('click', () => {
      clear({ confirmFirst: true });
    });

    document.getElementById('clearCartBtnMobile')?.addEventListener('click', () => {
      clear({ confirmFirst: true });
    });

    window.addEventListener('storage', event => {
      if (event.key !== STORAGE_KEY) return;
      load();
      render();
      refreshStoreCards();
    });
  }

  function validateCheckout(customerName, deliveryType, address) {
    if (!items.length) throw new Error('Carrito vacío');
    if (!String(customerName || '').trim()) throw new Error('Nombre del cliente requerido');
    if (deliveryType === 'delivery' && !String(address || '').trim()) {
      throw new Error('Dirección de entrega requerida');
    }
  }

  async function checkout(
    customerName,
    customerPhone,
    notes,
    deliveryType,
    address,
    scheduledDate,
    scheduledTime,
    gpsCoords
  ) {
    validateCheckout(customerName, deliveryType, address);

    if (checkoutInProgress) throw new Error('El pedido ya se está procesando');
    if (!window.db && typeof db === 'undefined') throw new Error('Firestore no está disponible');

    checkoutInProgress = true;

    try {
      const firestore = window.db || db;
      const collections = window.COLL || (typeof COLL !== 'undefined' ? COLL : null);
      const firebaseInstance = window.firebase || (typeof firebase !== 'undefined' ? firebase : null);

      if (!collections?.orders) throw new Error('Colección de pedidos no configurada');
      if (!firebaseInstance?.firestore?.FieldValue) throw new Error('Firebase no está inicializado');

      const orderItems = items.map(item => ({
        productId: item.id,
        name: item.name,
        price: +item.price.toFixed(2),
        qty: item.qty,
        subtotal: +(item.price * item.qty).toFixed(2)
      }));

      const order = {
        customer: String(customerName).trim(),
        customerPhone: String(customerPhone || '').trim() || null,
        items: orderItems,
        total: +total().toFixed(2),
        itemCount: count(),
        status: 'pending',
        notes: String(notes || '').trim() || null,
        deliveryType: deliveryType || 'pickup',
        deliveryAddress: String(address || '').trim() || null,
        scheduledDate: scheduledDate || null,
        scheduledTime: scheduledTime || null,
        location: gpsCoords || null,
        source: 'web',
        createdAt: firebaseInstance.firestore.FieldValue.serverTimestamp()
      };

      const reference = await firestore.collection(collections.orders).add(order);
      clear();
      return reference.id;
    } finally {
      checkoutInProgress = false;
    }
  }

  function init() {
    if (initialized) {
      render();
      return;
    }

    initialized = true;
    load();
    ensureMobileClearButton();
    bindEvents();
    render();
  }

  return {
    init,
    add,
    remove,
    removeAll,
    clear,
    qty,
    subtotal,
    total,
    count,
    getItems,
    render,
    checkout
  };
})();

window.Cart = Cart;
