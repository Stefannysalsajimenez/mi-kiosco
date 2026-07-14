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
    console.info(`[Cart:${type}] ${message}`);
  }

  function normalizeId(value) {
    return String(value ?? '').trim();
  }

  function normalizePrice(value) {
    const price = Number(value);
    return Number.isFinite(price) && price >= 0 ? price : 0;
  }

  function normalizeStock(value) {
    if (value === null || value === undefined || value === '') return null;
    const stock = Math.trunc(Number(value));
    return Number.isFinite(stock) && stock >= 0 ? stock : null;
  }

  function normalizeQty(value) {
    const quantity = Math.trunc(Number(value));
    if (!Number.isFinite(quantity)) return 1;
    return Math.max(1, Math.min(quantity, MAX_QTY_PER_ITEM));
  }

  function normalizeItem(item) {
    if (!item || typeof item !== 'object') return null;

    const id = normalizeId(item.id ?? item.productId);
    const name = String(item.name ?? '').trim();
    const stock = normalizeStock(item.stock);
    const quantity = normalizeQty(item.qty);

    if (!id || !name) return null;

    return {
      id,
      name,
      price: normalizePrice(item.price),
      unit: String(item.unit || 'Unidad').trim() || 'Unidad',
      imageUrl: item.imageUrl || item.resolvedImageUrl ? String(item.imageUrl || item.resolvedImageUrl) : null,
      qty: stock === null ? quantity : Math.min(quantity, Math.max(stock, 1)),
      stock
    };
  }

  function sanitizeItems(rawItems) {
    if (!Array.isArray(rawItems)) return [];

    const merged = new Map();
    rawItems.forEach(rawItem => {
      const item = normalizeItem(rawItem);
      if (!item || item.stock === 0) return;

      const existing = merged.get(item.id);
      if (!existing) {
        merged.set(item.id, item);
        return;
      }

      const limit = existing.stock === null ? MAX_QTY_PER_ITEM : existing.stock;
      existing.qty = Math.min(existing.qty + item.qty, Math.max(limit, 1), MAX_QTY_PER_ITEM);
      existing.name = item.name;
      existing.price = item.price;
      existing.unit = item.unit;
      existing.imageUrl = item.imageUrl || existing.imageUrl;
      if (item.stock !== null) existing.stock = item.stock;
    });

    return [...merged.values()];
  }

  function load() {
    try {
      items = sanitizeItems(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
      save(false);
    } catch (error) {
      console.warn('No se pudo leer el carrito:', error);
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

    if (emit) {
      window.dispatchEvent(new CustomEvent('cart:updated', {
        detail: { count: count(), total: total(), items: getItems() }
      }));
    }
  }

  function refreshStoreCards() {
    if (window.Store && typeof window.Store.refreshCards === 'function') {
      window.Store.refreshCards();
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
    const currentQuantity = existing?.qty || 0;
    const limit = stock === null ? MAX_QTY_PER_ITEM : stock;

    if (limit <= 0) {
      notify('Producto agotado', 'warning');
      return false;
    }

    if (currentQuantity >= limit) {
      notify(`Stock máximo disponible: ${limit}`, 'warning');
      return false;
    }

    const nextQuantity = Math.min(currentQuantity + increment, limit, MAX_QTY_PER_ITEM);

    if (existing) {
      existing.qty = nextQuantity;
      existing.name = normalized.name;
      existing.price = normalized.price;
      existing.unit = normalized.unit;
      existing.imageUrl = normalized.imageUrl || existing.imageUrl;
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

  function setQty(id, value, options = {}) {
    const item = getItem(id);
    if (!item) return false;

    const requested = Math.trunc(Number(value));
    if (!Number.isFinite(requested)) {
      render();
      return false;
    }

    if (requested <= 0) {
      return removeAll(id);
    }

    const limit = item.stock === null ? MAX_QTY_PER_ITEM : item.stock;
    const nextQuantity = Math.min(requested, Math.max(limit, 1), MAX_QTY_PER_ITEM);

    if (requested > limit && options.notify !== false) {
      notify(`Stock máximo disponible: ${limit}`, 'warning');
    }

    if (item.qty === nextQuantity) {
      render();
      return true;
    }

    item.qty = nextQuantity;
    persistAndRender();
    return true;
  }

  function remove(id, amount = 1) {
    const item = getItem(id);
    if (!item) return false;

    const decrement = Math.max(1, Math.trunc(Number(amount)) || 1);
    if (item.qty - decrement <= 0) {
      return removeAll(id);
    }

    item.qty -= decrement;
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
    if (!items.length) return false;
    if (options.confirmFirst && !window.confirm('¿Deseas vaciar el carrito?')) return false;
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
    return items.reduce((sum, item) => sum + item.price * item.qty, 0);
  }

  function count() {
    return items.reduce((sum, item) => sum + item.qty, 0);
  }

  function getItems() {
    return items.map(item => ({ ...item }));
  }

  function getCurrency() {
    return window.APP_CONFIG?.currency || 'S/';
  }

  function formatMoney(value) {
    return `${getCurrency()} ${Number(value || 0).toFixed(2)}`;
  }

  function createPlaceholder() {
    const placeholder = document.createElement('div');
    placeholder.className = 'cart-item-img-ph';
    placeholder.innerHTML = '<i class="bi bi-bag" aria-hidden="true"></i>';
    return placeholder;
  }

  function createImage(item) {
    if (!item.imageUrl) return createPlaceholder();

    const image = document.createElement('img');
    image.className = 'cart-item-img';
    image.width = 52;
    image.height = 52;
    image.loading = 'lazy';
    image.alt = item.name;
    image.src = item.imageUrl;
    image.addEventListener('error', () => image.replaceWith(createPlaceholder()), { once: true });
    return image;
  }

  function createActionButton(action, item, icon, label, className) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn btn-xs cart-action ${className}`;
    button.dataset.cartAction = action;
    button.dataset.productId = item.id;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = `<i class="bi bi-${icon}" aria-hidden="true"></i>`;
    return button;
  }

  function createQuantityInput(item) {
    const input = document.createElement('input');
    input.type = 'number';
    input.inputMode = 'numeric';
    input.className = 'form-control form-control-sm cart-qty-input';
    input.dataset.cartQtyInput = 'true';
    input.dataset.productId = item.id;
    input.min = '1';
    input.max = String(item.stock === null ? MAX_QTY_PER_ITEM : item.stock);
    input.value = String(item.qty);
    input.setAttribute('aria-label', `Cantidad de ${item.name}`);
    return input;
  }

  function createCartItem(item) {
    const row = document.createElement('article');
    row.className = 'cart-item';
    row.dataset.productId = item.id;

    row.append(createImage(item));

    const content = document.createElement('div');
    content.className = 'min-width-0';

    const top = document.createElement('div');
    top.className = 'd-flex justify-content-between gap-2';

    const details = document.createElement('div');
    details.className = 'flex-grow-1 min-width-0';

    const name = document.createElement('div');
    name.className = 'fw-semibold small text-truncate';
    name.textContent = item.name;

    const unitPrice = document.createElement('div');
    unitPrice.className = 'text-muted small';
    unitPrice.textContent = `${formatMoney(item.price)} / ${item.unit}`;

    const itemSubtotal = document.createElement('div');
    itemSubtotal.className = 'cart-item-subtotal';
    itemSubtotal.textContent = `Subtotal: ${formatMoney(item.price * item.qty)}`;

    details.append(name, unitPrice, itemSubtotal);

    const removeButton = createActionButton('remove', item, 'trash', `Eliminar ${item.name}`, 'btn-outline-danger');
    top.append(details, removeButton);

    const controls = document.createElement('div');
    controls.className = 'd-flex align-items-center gap-1 mt-2';

    const decrease = createActionButton('decrease', item, 'dash', `Disminuir ${item.name}`, 'btn-outline-secondary');
    const input = createQuantityInput(item);
    const increase = createActionButton('increase', item, 'plus', `Aumentar ${item.name}`, 'btn-outline-secondary');
    if (item.stock !== null && item.qty >= item.stock) increase.disabled = true;

    const available = document.createElement('small');
    available.className = 'text-muted ms-1 cart-stock-available';
    available.textContent = item.stock === null ? 'Stock ilimitado' : `Disponible: ${Math.max(item.stock - item.qty, 0)}`;

    controls.append(decrease, input, increase, available);
    content.append(top, controls);
    row.append(content);
    return row;
  }

  function renderList(element) {
    if (!element) return;
    const fragment = document.createDocumentFragment();
    items.forEach(item => fragment.append(createCartItem(item)));
    element.replaceChildren(fragment);
  }

  function toggleElement(element, visible, display = '') {
    if (!element) return;
    element.hidden = !visible;
    element.style.display = visible ? display : 'none';
  }

  function render() {
    const countValue = count();
    const totalText = formatMoney(total());
    const hasItems = items.length > 0;

    document.querySelectorAll('.cart-count').forEach(element => {
      element.textContent = String(countValue);
      toggleElement(element, countValue > 0, 'inline-flex');
    });

    renderList(document.getElementById('cartItemsList'));
    renderList(document.getElementById('cartItemsListMobile'));

    ['cartTotal', 'cartSubtotalMobile', 'cartTotalMobile'].forEach(id => {
      const element = document.getElementById(id);
      if (element) element.textContent = totalText;
    });

    toggleElement(document.getElementById('cartEmpty'), !hasItems, 'block');
    toggleElement(document.getElementById('cartEmptyMobile'), !hasItems, 'block');
    toggleElement(document.getElementById('cartFooter'), hasItems, 'block');
    toggleElement(document.getElementById('cartFooterMobile'), hasItems, 'block');

    ['clearCartBtn', 'clearCartBtnMobile', 'sendOrderBtn', 'sendOrderBtnMobile', 'shareWhatsappBtn', 'shareWhatsappBtnMobile']
      .forEach(id => {
        const button = document.getElementById(id);
        if (button) button.disabled = !hasItems;
      });
  }

  function handleClick(event) {
    const button = event.target.closest('[data-cart-action]');
    if (!button) return;

    const id = button.dataset.productId;
    if (button.dataset.cartAction === 'increase') {
      const item = getItem(id);
      if (item) add(item);
    }
    if (button.dataset.cartAction === 'decrease') remove(id);
    if (button.dataset.cartAction === 'remove') removeAll(id);
  }

  function handleQuantityChange(event) {
    const input = event.target.closest('[data-cart-qty-input]');
    if (!input) return;
    setQty(input.dataset.productId, input.value);
  }

  function handleQuantityKeydown(event) {
    const input = event.target.closest('[data-cart-qty-input]');
    if (!input || event.key !== 'Enter') return;
    event.preventDefault();
    input.blur();
  }

  function bindEvents() {
    document.addEventListener('click', handleClick);
    document.addEventListener('change', handleQuantityChange);
    document.addEventListener('keydown', handleQuantityKeydown);

    document.getElementById('clearCartBtn')?.addEventListener('click', () => clear({ confirmFirst: true }));
    document.getElementById('clearCartBtnMobile')?.addEventListener('click', () => clear({ confirmFirst: true }));

    window.addEventListener('storage', event => {
      if (event.key !== STORAGE_KEY) return;
      load();
      render();
      refreshStoreCards();
    });
  }

  function syncProducts(productList) {
    if (!Array.isArray(productList) || !items.length) return;

    const products = new Map(productList.map(product => [normalizeId(product.id), product]));
    let changed = false;
    let adjusted = false;

    items = items.filter(item => {
      const product = products.get(item.id);
      if (!product || product.active === false) {
        changed = true;
        return false;
      }

      const nextStock = normalizeStock(product.stock);
      if (nextStock === 0) {
        changed = true;
        adjusted = true;
        return false;
      }

      const nextPrice = normalizePrice(product.price);
      const nextName = String(product.name || item.name).trim();
      const nextUnit = String(product.unit || item.unit || 'Unidad').trim();
      const nextImageUrl = product.imageUrl || product.resolvedImageUrl || item.imageUrl || null;
      const nextQty = nextStock === null ? item.qty : Math.min(item.qty, nextStock);

      if (
        item.stock !== nextStock ||
        item.price !== nextPrice ||
        item.name !== nextName ||
        item.unit !== nextUnit ||
        item.imageUrl !== nextImageUrl ||
        item.qty !== nextQty
      ) {
        changed = true;
      }
      if (item.qty !== nextQty) adjusted = true;

      item.stock = nextStock;
      item.price = nextPrice;
      item.name = nextName;
      item.unit = nextUnit;
      item.imageUrl = nextImageUrl;
      item.qty = nextQty;
      return true;
    });

    if (!changed) return;
    save();
    render();
    if (adjusted) notify('El carrito se ajustó al stock disponible', 'warning');
  }

  function validateCheckout(customerName, deliveryType, address) {
    if (!items.length) throw new Error('El carrito está vacío');
    if (!String(customerName || '').trim()) throw new Error('El nombre del cliente es obligatorio');
    if (deliveryType === 'delivery' && !String(address || '').trim()) {
      throw new Error('La dirección de entrega es obligatoria');
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
    if (!window.db || !window.COLL) throw new Error('Firestore no está disponible');

    checkoutInProgress = true;

    try {
      const orderReference = db.collection(COLL.orders).doc();
      const currentItems = getItems();

      await db.runTransaction(async transaction => {
        const productSnapshots = [];
        for (const item of currentItems) {
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

          const currentStock = normalizeStock(product.stock);
          if (currentStock !== null && currentStock < item.qty) {
            throw new Error(`Stock insuficiente para ${item.name}. Disponible: ${currentStock}`);
          }

          const currentPrice = normalizePrice(product.price);
          const unit = String(product.unit || item.unit || 'Unidad').trim();
          orderItems.push({
            productId: item.id,
            name: String(product.name || item.name),
            price: Number(currentPrice.toFixed(2)),
            qty: item.qty,
            unit,
            subtotal: Number((currentPrice * item.qty).toFixed(2))
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
          notes: String(notes || '').trim() || null,
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

      clear();
      return orderReference.id;
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
    bindEvents();
    const currentProducts = window.Store?.getProducts?.() || [];
    if (currentProducts.length) syncProducts(currentProducts);
    render();
  }

  return {
    init,
    add,
    setQty,
    remove,
    removeAll,
    clear,
    qty,
    subtotal,
    total,
    count,
    getItems,
    render,
    syncProducts,
    checkout
  };
})();

window.Cart = Cart;
