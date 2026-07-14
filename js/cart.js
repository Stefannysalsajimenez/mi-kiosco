// js/cart.js
const Cart = (() => {
  const KEY = 'kk_cart';
  let items = [];

  function load() {
    try { items = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { items = []; }
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(items)); }

  function add(prod) {
    const idx = items.findIndex(i => i.id === prod.id);
    if (idx >= 0) items[idx].qty++;
    else items.push({ id: prod.id, name: prod.name, price: prod.price, imageUrl: prod.imageUrl || null, qty: 1 });
    save(); render(); if (window.Store) Store.refreshCards();
  }

  function remove(id) {
    const idx = items.findIndex(i => i.id === id);
    if (idx < 0) return;
    if (items[idx].qty > 1) items[idx].qty--;
    else items.splice(idx, 1);
    save(); render(); if (window.Store) Store.refreshCards();
  }

  function clear() { items = []; save(); render(); if (window.Store) Store.refreshCards(); }

  function qty(id) { return items.find(i => i.id === id)?.qty || 0; }
  function total() { return items.reduce((s, i) => s + i.price * i.qty, 0); }
  function count() { return items.reduce((s, i) => s + i.qty, 0); }
  function getItems() { return items; }

  function render() {
    const cnt = count();
    document.querySelectorAll('.cart-count').forEach(el => {
      el.textContent = cnt;
      el.style.display = cnt > 0 ? 'inline-flex' : 'none';
    });

    const list = document.getElementById('cartItemsList');
    const footer = document.getElementById('cartFooter');
    const empty = document.getElementById('cartEmpty');
    if (!list) return;

    if (!items.length) {
      list.innerHTML = '';
      if (footer) footer.style.display = 'none';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';
    if (footer) footer.style.display = 'block';

    list.innerHTML = items.map(it => `
      <div class="cart-item d-flex align-items-center gap-2 py-2 border-bottom">
        ${it.imageUrl ? `<img src="${it.imageUrl}" class="cart-item-img rounded" width="48" height="48" style="object-fit:cover" onerror="this.style.display='none'">` : `<div class="cart-item-img-ph rounded bg-secondary d-flex align-items-center justify-content-center" style="width:48px;height:48px"><i class="bi bi-bag text-white"></i></div>`}
        <div class="flex-grow-1 min-width-0">
          <div class="fw-semibold small text-truncate">${it.name}</div>
          <div class="text-muted small">${APP_CONFIG.currency} ${it.price.toFixed(2)}</div>
        </div>
        <div class="d-flex align-items-center gap-1">
          <button class="btn btn-outline-secondary btn-xs p-0 px-1" onclick="Cart.remove('${it.id}')"><i class="bi bi-dash"></i></button>
          <span class="small fw-bold px-1">${it.qty}</span>
          <button class="btn btn-outline-secondary btn-xs p-0 px-1" onclick="Cart.add({id:'${it.id}',name:'${it.name.replace(/'/g, "\\'")}',price:${it.price},imageUrl:'${it.imageUrl || ''}'})" ><i class="bi bi-plus"></i></button>
          <button class="btn btn-outline-danger btn-xs p-0 px-1 ms-1" onclick="Cart.removeAll('${it.id}')"><i class="bi bi-x"></i></button>
        </div>
      </div>`).join('');

    const tot = document.getElementById('cartTotal');
    if (tot) tot.textContent = `${APP_CONFIG.currency} ${total().toFixed(2)}`;
  }

  function removeAll(id) {
    items = items.filter(i => i.id !== id);
    save(); render(); if (window.Store) Store.refreshCards();
  }

  async function checkout(customerName, customerPhone, notes, deliveryType, address, scheduledDate, scheduledTime, gpsCoords) {
    if (!items.length) throw new Error('Carrito vacío');
    const order = {
      customer: customerName,
      customerPhone: customerPhone || null,
      items: items.map(i => ({ productId: i.id, name: i.name, price: i.price, qty: i.qty, subtotal: +(i.price * i.qty).toFixed(2) })),
      total: +total().toFixed(2),
      status: 'pending',
      notes: notes || null,
      deliveryType: deliveryType || 'pickup',
      deliveryAddress: address || null,
      scheduledDate: scheduledDate || null,
      scheduledTime: scheduledTime || null,
      location: gpsCoords || null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    const ref = await db.collection(COLL.orders).add(order);
    clear();
    return ref.id;
  }

  function init() {
    load(); render();
    document.getElementById('clearCartBtn')?.addEventListener('click', () => {
      if (confirm('¿Limpiar carrito?')) clear();
    });
  }

  return { init, add, remove, removeAll, clear, qty, total, count, getItems, render, checkout };
})();
