// js/orders.js — Admin orders management
const Orders = (() => {
  let unsub = null, filter = 'all', allOrders = [];

  function init() {
    bindFilters();
    subscribe();
  }

  function bindFilters() {
    document.querySelectorAll('[data-orders-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-orders-filter]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        filter = btn.dataset.ordersFilter;
        render(allOrders);
      });
    });
  }

  function subscribe() {
    if (unsub) unsub();
    // No orderBy — sort in JS
    unsub = db.collection(COLL.orders).onSnapshot(snap => {
      allOrders = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const ta = a.createdAt?.toDate?.() || new Date(0);
          const tb = b.createdAt?.toDate?.() || new Date(0);
          return tb - ta;
        });
      render(allOrders);
    }, err => console.warn('orders:', err.code));
  }

  function render(list) {
    const container = document.getElementById('ordersContainer');
    if (!container) return;

    let filtered = filter === 'all' ? list : list.filter(o => o.status === filter);

    if (!filtered.length) {
      container.innerHTML = `<div class="col-12 text-center py-5"><i class="bi bi-clipboard-x display-4 text-muted"></i><p class="mt-3 text-muted">No hay pedidos</p></div>`;
      return;
    }

    const statusBadge = { pending: 'warning', done: 'success', rejected: 'danger' };
    const statusLabel = { pending: 'Pendiente', done: 'Completado', rejected: 'Rechazado' };

    container.innerHTML = filtered.map(o => {
      const dt = o.createdAt?.toDate ? o.createdAt.toDate().toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
      const items = (o.items || []).map(i => `${i.name} ×${i.qty}`).join(', ');
      const locLink = o.location ? `<a href="https://www.google.com/maps?q=${o.location.lat},${o.location.lng}" target="_blank" class="btn btn-outline-info btn-sm py-0 mt-1"><i class="bi bi-geo-alt me-1"></i>GPS</a>` : '';
      return `<div class="col-12 col-md-6 col-xl-4">
        <div class="card h-100 order-card border-start border-4 border-${statusBadge[o.status] || 'secondary'}">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start mb-2">
              <div>
                <strong class="d-block">${esc(o.customer || 'Cliente')}</strong>
                ${o.customerPhone ? `<small class="text-muted"><i class="bi bi-telephone me-1"></i>${o.customerPhone}</small>` : ''}
              </div>
              <span class="badge bg-${statusBadge[o.status] || 'secondary'}">${statusLabel[o.status] || o.status}</span>
            </div>
            <p class="small text-muted mb-1"><i class="bi bi-clock me-1"></i>${dt}</p>
            <p class="small mb-1"><i class="bi bi-bag me-1"></i>${esc(items)}</p>
            ${o.deliveryType === 'delivery' ? `<p class="small mb-1"><i class="bi bi-truck me-1"></i>${esc(o.deliveryAddress || 'Sin dirección')}</p>` : `<p class="small mb-1"><i class="bi bi-shop me-1"></i>Recojo en tienda</p>`}
            ${o.scheduledDate ? `<p class="small mb-1"><i class="bi bi-calendar me-1"></i>${o.scheduledDate}${o.scheduledTime ? ' ' + o.scheduledTime : ''}</p>` : ''}
            ${o.notes ? `<p class="small mb-1 text-muted"><i class="bi bi-chat-left-text me-1"></i>${esc(o.notes)}</p>` : ''}
            ${locLink}
            <div class="d-flex justify-content-between align-items-center mt-2 pt-2 border-top">
              <strong class="text-primary">${APP_CONFIG.currency} ${(o.total || 0).toFixed(2)}</strong>
              <div class="btn-group btn-group-sm">
                <button class="btn btn-outline-warning" onclick="Orders.setStatus('${o.id}','pending')" title="Pendiente"><i class="bi bi-hourglass"></i></button>
                <button class="btn btn-outline-success" onclick="Orders.setStatus('${o.id}','done')" title="Completado"><i class="bi bi-check-lg"></i></button>
                <button class="btn btn-outline-danger" onclick="Orders.setStatus('${o.id}','rejected')" title="Rechazado"><i class="bi bi-x-lg"></i></button>
                <button class="btn btn-outline-secondary" onclick="Orders.invoice('${o.id}')" title="Boleta"><i class="bi bi-receipt"></i></button>
                <button class="btn btn-outline-danger" onclick="Orders.del('${o.id}')" title="Eliminar"><i class="bi bi-trash"></i></button>
              </div>
            </div>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  async function setStatus(id, status) {
    try {
      await db.collection(COLL.orders).doc(id).update({ status, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      showToast({ pending: 'Marcado como pendiente', done: 'Pedido completado ✓', rejected: 'Pedido rechazado' }[status] || 'Actualizado', status === 'done' ? 'success' : 'info');
    } catch (e) { showToast('Error: ' + e.message, 'danger'); }
  }

  async function del(id) {
    const o = allOrders.find(x => x.id === id);
    if (!confirm(`¿Eliminar pedido de "${o?.customer || 'cliente'}"?`)) return;
    try {
      await db.collection(COLL.orders).doc(id).delete();
      showToast('Pedido eliminado', 'info');
    } catch (e) { showToast('Error: ' + e.message, 'danger'); }
  }

  function invoice(id) {
    const o = allOrders.find(x => x.id === id);
    if (!o) return;
    const rows = (o.items || []).map(i => `<tr><td>${i.name}</td><td class="text-center">${i.qty}</td><td class="text-end">${APP_CONFIG.currency} ${i.price.toFixed(2)}</td><td class="text-end">${APP_CONFIG.currency} ${i.subtotal.toFixed(2)}</td></tr>`).join('');
    const dt = o.createdAt?.toDate ? o.createdAt.toDate().toLocaleString('es-PE') : new Date().toLocaleString('es-PE');
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Boleta</title>
    <style>body{font-family:Arial,sans-serif;max-width:600px;margin:2rem auto;padding:1rem}h1{color:#f97316}table{width:100%;border-collapse:collapse;margin:1rem 0}th,td{padding:8px;border-bottom:1px solid #eee}th{background:#f5f5f5}.total{font-size:1.2rem;font-weight:bold;color:#f97316}</style></head>
    <body><h1>${APP_CONFIG.storeName || 'Kiosco'}</h1>
    <p>Fecha: ${dt}</p><p>Cliente: <strong>${o.customer}</strong></p>
    <table><thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="total">TOTAL: ${APP_CONFIG.currency} ${o.total.toFixed(2)}</p>
    <script>window.print()<\/script></body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
  }

  function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  return { init, setStatus, del, invoice };
})();
