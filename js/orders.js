'use strict';

const Orders = (() => {
  let unsubscribe = null;
  let statusFilter = 'all';
  let periodFilter = 'day';
  let allOrders = [];
  let initialized = false;
  let refreshTimer = null;

  function init() {
    if (initialized) {
      refresh();
      return;
    }

    initialized = true;
    bindFilters();
    bindExport();
    subscribe();
    refreshTimer = window.setInterval(refresh, 60000);
  }

  function refresh() {
    renderCurrent();
  }

  function bindFilters() {
    document.querySelectorAll('[data-orders-filter]').forEach(button => {
      if (button.dataset.ordersStatusBound === 'true') return;
      button.dataset.ordersStatusBound = 'true';
      button.addEventListener('click', () => {
        document.querySelectorAll('[data-orders-filter]').forEach(item => item.classList.remove('active'));
        button.classList.add('active');
        statusFilter = button.dataset.ordersFilter || 'all';
        renderCurrent();
      });
    });

    document.querySelectorAll('[data-orders-period]').forEach(button => {
      if (button.dataset.ordersPeriodBound === 'true') return;
      button.dataset.ordersPeriodBound = 'true';
      button.addEventListener('click', () => {
        document.querySelectorAll('[data-orders-period]').forEach(item => item.classList.remove('active'));
        button.classList.add('active');
        periodFilter = button.dataset.ordersPeriod || 'day';
        renderCurrent();
      });
    });
  }

  function bindExport() {
    const button = document.getElementById('ordersExportBtn');
    if (!button || button.dataset.ordersExportBound === 'true') return;

    button.dataset.ordersExportBound = 'true';
    button.addEventListener('click', async () => {
      const list = getFilteredOrders();
      const statusName = {
        all: 'Todos',
        pending: 'Pendientes',
        done: 'Completados',
        rejected: 'Rechazados'
      }[statusFilter] || 'Pedidos';
      const periodName = {
        day: 'Hoy',
        week: 'Semana',
        month: 'Mes'
      }[periodFilter] || 'Historial';

      if (typeof Dashboard === 'undefined' || typeof Dashboard.exportOrders !== 'function') {
        showToast('El exportador de Excel no está disponible', 'danger');
        return;
      }

      await Dashboard.exportOrders(list, {
        period: periodFilter,
        periodLabel: `${periodName} - ${statusName}`,
        button,
        filePrefix: `historial-${statusFilter}`,
        lockKey: `orders:${periodFilter}:${statusFilter}`
      });
    });
  }

  function subscribe() {
    if (typeof unsubscribe === 'function') unsubscribe();

    unsubscribe = db.collection(COLL.orders).onSnapshot(snapshot => {
      allOrders = snapshot.docs
        .map(documentSnapshot => ({ id: documentSnapshot.id, ...documentSnapshot.data() }))
        .sort((left, right) => toDate(right.createdAt) - toDate(left.createdAt));
      renderCurrent();
    }, error => {
      console.warn('Pedidos:', error?.code || error);
      showToast('No se pudieron actualizar los pedidos', 'warning');
    });
  }

  function toDate(value) {
    if (!value) return new Date(0);
    if (typeof value.toDate === 'function') return value.toDate();
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? new Date(0) : date;
  }

  function filterByPeriod(list) {
    if (typeof Dashboard !== 'undefined' && typeof Dashboard.filterByPeriod === 'function') {
      return Dashboard.filterByPeriod(list, periodFilter);
    }

    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);

    if (periodFilter === 'day') {
      start.setHours(0, 0, 0, 0);
      end.setTime(start.getTime());
      end.setDate(end.getDate() + 1);
    } else if (periodFilter === 'week') {
      const day = start.getDay();
      start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
      start.setHours(0, 0, 0, 0);
      end.setTime(start.getTime());
      end.setDate(end.getDate() + 7);
    } else {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setTime(start.getTime());
      end.setMonth(end.getMonth() + 1);
    }

    return list.filter(order => {
      const createdAt = toDate(order.createdAt);
      return createdAt >= start && createdAt < end;
    });
  }

  function getFilteredOrders() {
    const periodOrders = filterByPeriod(allOrders);
    if (statusFilter === 'all') return periodOrders;
    return periodOrders.filter(order => order.status === statusFilter);
  }

  function renderCurrent() {
    render(getFilteredOrders());
    const counter = document.getElementById('ordersFilteredCount');
    if (counter) counter.textContent = String(getFilteredOrders().length);
  }

  function render(list) {
    const container = document.getElementById('ordersContainer');
    if (!container) return;

    if (!list.length) {
      container.innerHTML = `
        <div class="col-12 text-center py-5">
          <i class="bi bi-clipboard-x display-4 text-muted"></i>
          <p class="mt-3 text-muted">No hay pedidos para el filtro seleccionado</p>
        </div>`;
      return;
    }

    const statusBadge = { pending: 'warning', done: 'success', rejected: 'danger' };
    const statusLabel = { pending: 'Pendiente', done: 'Completado', rejected: 'Rechazado' };

    container.innerHTML = list.map(order => {
      const createdAt = toDate(order.createdAt);
      const dateText = createdAt.getTime()
        ? createdAt.toLocaleString('es-PE', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
        : '—';
      const items = (order.items || []).map(item => {
        const unit = item.unit ? ` ${item.unit}` : '';
        return `${item.name} ×${item.qty}${unit}`;
      }).join(', ');
      const locationLink = order.location
        ? `<a href="https://www.google.com/maps?q=${Number(order.location.lat)},${Number(order.location.lng)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline-info btn-sm py-0 mt-1"><i class="bi bi-geo-alt me-1"></i>GPS</a>`
        : '';

      return `
        <div class="col-12 col-md-6 col-xl-4">
          <div class="card h-100 order-card border-start border-4 border-${statusBadge[order.status] || 'secondary'}">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-start mb-2 gap-2">
                <div class="min-width-0">
                  <strong class="d-block text-break">${escapeHtml(order.customer || 'Cliente')}</strong>
                  ${order.customerPhone ? `<small class="text-muted"><i class="bi bi-telephone me-1"></i>${escapeHtml(order.customerPhone)}</small>` : ''}
                </div>
                <span class="badge bg-${statusBadge[order.status] || 'secondary'}">${statusLabel[order.status] || escapeHtml(order.status)}</span>
              </div>
              <p class="small text-muted mb-1"><i class="bi bi-clock me-1"></i>${escapeHtml(dateText)}</p>
              <p class="small mb-1 text-break"><i class="bi bi-bag me-1"></i>${escapeHtml(items)}</p>
              ${order.deliveryType === 'delivery'
                ? `<p class="small mb-1 text-break"><i class="bi bi-truck me-1"></i>${escapeHtml(order.deliveryAddress || 'Sin dirección')}</p>`
                : '<p class="small mb-1"><i class="bi bi-shop me-1"></i>Recojo en tienda</p>'}
              ${order.scheduledDate ? `<p class="small mb-1"><i class="bi bi-calendar me-1"></i>${escapeHtml(order.scheduledDate)}${order.scheduledTime ? ` ${escapeHtml(order.scheduledTime)}` : ''}</p>` : ''}
              ${order.notes ? `<p class="small mb-1 text-muted text-break"><i class="bi bi-chat-left-text me-1"></i>${escapeHtml(order.notes)}</p>` : ''}
              ${locationLink}
              <div class="d-flex justify-content-between align-items-center mt-2 pt-2 border-top gap-2">
                <strong class="text-primary">${getCurrency()} ${Number(order.total || 0).toFixed(2)}</strong>
                <div class="btn-group btn-group-sm flex-shrink-0">
                  <button class="btn btn-outline-warning" onclick="Orders.setStatus('${order.id}','pending')" title="Pendiente" aria-label="Marcar pendiente"><i class="bi bi-hourglass"></i></button>
                  <button class="btn btn-outline-success" onclick="Orders.setStatus('${order.id}','done')" title="Completado" aria-label="Marcar completado"><i class="bi bi-check-lg"></i></button>
                  <button class="btn btn-outline-danger" onclick="Orders.setStatus('${order.id}','rejected')" title="Rechazado" aria-label="Marcar rechazado"><i class="bi bi-x-lg"></i></button>
                  <button class="btn btn-outline-secondary" onclick="Orders.invoice('${order.id}')" title="Boleta" aria-label="Abrir boleta"><i class="bi bi-receipt"></i></button>
                  <button class="btn btn-outline-danger" onclick="Orders.del('${order.id}')" title="Eliminar" aria-label="Eliminar pedido"><i class="bi bi-trash"></i></button>
                </div>
              </div>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  function getCurrency() {
    return window.APP_CONFIG?.currency || 'S/';
  }

  async function setStatus(id, status) {
    try {
      await db.collection(COLL.orders).doc(id).update({
        status,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      const messages = {
        pending: 'Marcado como pendiente',
        done: 'Pedido completado',
        rejected: 'Pedido rechazado'
      };
      showToast(messages[status] || 'Pedido actualizado', status === 'done' ? 'success' : 'info');
    } catch (error) {
      showToast(`No se pudo actualizar el pedido: ${error.message}`, 'danger');
    }
  }

  async function del(id) {
    const order = allOrders.find(item => item.id === id);
    if (!window.confirm(`¿Eliminar pedido de "${order?.customer || 'cliente'}"?`)) return;

    try {
      await db.collection(COLL.orders).doc(id).delete();
      showToast('Pedido eliminado', 'info');
    } catch (error) {
      showToast(`No se pudo eliminar el pedido: ${error.message}`, 'danger');
    }
  }

  function invoice(id) {
    const order = allOrders.find(item => item.id === id);
    if (!order) return;

    const rows = (order.items || []).map(item => {
      const quantity = Number(item.qty || 0);
      const price = Number(item.price || 0);
      const subtotal = Number(item.subtotal ?? price * quantity);
      return `
        <tr>
          <td>${escapeHtml(item.name)}</td>
          <td class="text-center">${quantity}</td>
          <td>${escapeHtml(item.unit || 'Unidad')}</td>
          <td class="text-end">${getCurrency()} ${price.toFixed(2)}</td>
          <td class="text-end">${getCurrency()} ${subtotal.toFixed(2)}</td>
        </tr>`;
    }).join('');

    const dateText = toDate(order.createdAt).toLocaleString('es-PE');
    const html = `<!DOCTYPE html>
      <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Boleta</title>
          <style>
            body{font-family:Arial,sans-serif;max-width:700px;margin:2rem auto;padding:1rem;color:#202124}
            h1{color:#f97316}table{width:100%;border-collapse:collapse;margin:1rem 0}
            th,td{padding:8px;border-bottom:1px solid #ddd}th{background:#f5f5f5}.total{font-size:1.2rem;font-weight:bold;color:#f97316}
          </style>
        </head>
        <body>
          <h1>${escapeHtml(window.APP_CONFIG?.storeName || 'Kiosco')}</h1>
          <p>Fecha: ${escapeHtml(dateText)}</p>
          <p>Cliente: <strong>${escapeHtml(order.customer || 'Cliente')}</strong></p>
          <table>
            <thead><tr><th>Producto</th><th>Cant.</th><th>Unidad</th><th>Precio</th><th>Subtotal</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <p class="total">TOTAL: ${getCurrency()} ${Number(order.total || 0).toFixed(2)}</p>
          <script>window.print()<\/script>
        </body>
      </html>`;

    const printWindow = window.open('', '_blank', 'noopener,noreferrer');
    if (!printWindow) {
      showToast('El navegador bloqueó la ventana de impresión', 'warning');
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  return {
    init,
    refresh,
    setStatus,
    del,
    invoice,
    getFilteredOrders
  };
})();

window.Orders = Orders;
