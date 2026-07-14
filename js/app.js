'use strict';

const AppDom = {
  byId(id) {
    return document.getElementById(id);
  },

  bind(element, eventName, handler, options) {
    if (!element) return;
    const key = `bound${eventName.replace(/[^a-z0-9]/gi, '')}`;
    if (element.dataset[key] === 'true') return;
    element.addEventListener(eventName, handler, options);
    element.dataset[key] = 'true';
  },

  modal(id) {
    const element = this.byId(id);
    if (!element || typeof bootstrap === 'undefined') return null;
    return bootstrap.Modal.getOrCreateInstance(element);
  },

  offcanvas(id) {
    const element = this.byId(id);
    if (!element || typeof bootstrap === 'undefined') return null;
    return bootstrap.Offcanvas.getOrCreateInstance(element);
  }
};

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message, type = 'info') {
  const container = AppDom.byId('toastContainer');
  if (!container) return;

  const iconByType = {
    success: 'check-circle-fill',
    danger: 'exclamation-triangle-fill',
    info: 'info-circle-fill',
    warning: 'exclamation-circle-fill'
  };

  const classByType = {
    success: 'text-bg-success',
    danger: 'text-bg-danger',
    info: 'text-bg-info',
    warning: 'text-bg-warning'
  };

  const toast = document.createElement('div');
  toast.className = `toast align-items-center ${classByType[type] || 'text-bg-secondary'} border-0`;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'assertive');
  toast.setAttribute('aria-atomic', 'true');

  const wrapper = document.createElement('div');
  wrapper.className = 'd-flex';

  const body = document.createElement('div');
  body.className = 'toast-body';

  const icon = document.createElement('i');
  icon.className = `bi bi-${iconByType[type] || 'info-circle-fill'} me-2`;

  const text = document.createElement('span');
  text.textContent = String(message ?? '');

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'btn-close btn-close-white me-2 m-auto';
  close.setAttribute('data-bs-dismiss', 'toast');
  close.setAttribute('aria-label', 'Cerrar');

  body.append(icon, text);
  wrapper.append(body, close);
  toast.append(wrapper);
  container.append(toast);

  if (typeof bootstrap === 'undefined') {
    toast.classList.add('show');
    window.setTimeout(() => toast.remove(), 3500);
    return;
  }

  const instance = bootstrap.Toast.getOrCreateInstance(toast, { delay: 3500 });
  toast.addEventListener('hidden.bs.toast', () => toast.remove(), { once: true });
  instance.show();
}

window.esc = esc;
window.showToast = showToast;

const App = (() => {
  let currentPage = 'store';
  const initializedModules = new Set();

  function initializeModule(name, moduleObject) {
    if (!moduleObject || typeof moduleObject.init !== 'function') return;
    if (!initializedModules.has(name)) {
      moduleObject.init();
      initializedModules.add(name);
      return;
    }
    if (typeof moduleObject.refresh === 'function') moduleObject.refresh();
  }

  function showPage(page) {
    const target = AppDom.byId(`page-${page}`);
    if (!target) {
      console.warn(`Página no encontrada: ${page}`);
      return;
    }

    currentPage = page;
    document.querySelectorAll('.page-view').forEach(view => {
      const isActive = view === target;
      view.classList.toggle('active-page', isActive);
      view.setAttribute('aria-hidden', String(!isActive));
    });

    document.body.dataset.page = page;
    closeResponsivePanels();

    if (page === 'admin') {
      initializeModule('admin', typeof Admin !== 'undefined' ? Admin : null);
      initializeModule('dashboard', typeof Dashboard !== 'undefined' ? Dashboard : null);
      initializeModule('orders', typeof Orders !== 'undefined' ? Orders : null);
      updateProfileButton(true);
      document.querySelector('.admin-main')?.scrollTo({ top: 0, behavior: 'auto' });
    } else {
      updateProfileButton(false);
      document.querySelector('.products-main')?.scrollTo({ top: 0, behavior: 'auto' });
    }
  }

  function updateProfileButton(isAdminPage = currentPage === 'admin') {
    const button = AppDom.byId('profileBtn');
    if (!button) return;

    if (isAdminPage) {
      button.innerHTML = '<i class="bi bi-tools"></i>';
      button.title = 'Cambiar entre tienda y administración';
      button.setAttribute('aria-label', button.title);
      return;
    }

    const name = typeof Auth !== 'undefined' ? Auth.getClientName() : '';
    button.innerHTML = '<i class="bi bi-person-circle"></i>';
    button.title = name ? `${name} — Mi perfil` : 'Ingresar';
    button.setAttribute('aria-label', button.title);
  }

  return {
    showPage,
    updateProfileButton,
    get currentPage() {
      return currentPage;
    }
  };
})();

window.App = App;

function getCurrency() {
  return window.APP_CONFIG?.currency || 'S/';
}

function sanitizePhone(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 9);
}

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function localTimeValue(date = new Date()) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function setBusy(button, busy, busyText, normalHtml) {
  if (!button) return;
  button.disabled = busy;
  button.setAttribute('aria-busy', String(busy));
  button.innerHTML = busy
    ? `<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>${esc(busyText)}`
    : normalHtml;
}

function switchAuthTab(tab) {
  const clientCard = AppDom.byId('tabClient');
  const adminCard = AppDom.byId('tabAdmin');
  const clientPanel = AppDom.byId('panelClient');
  const adminPanel = AppDom.byId('panelAdmin');
  const clientActive = tab === 'client';

  clientCard?.classList.toggle('selected', clientActive);
  clientCard?.classList.toggle('active', clientActive);
  adminCard?.classList.toggle('selected', !clientActive);
  adminCard?.classList.toggle('active', !clientActive);
  clientCard?.setAttribute('aria-selected', String(clientActive));
  adminCard?.setAttribute('aria-selected', String(!clientActive));

  if (clientPanel) clientPanel.style.display = clientActive ? 'block' : 'none';
  if (adminPanel) adminPanel.style.display = clientActive ? 'none' : 'block';
}

function showAuthChoice() {
  const stepOne = AppDom.byId('step1Admin');
  const stepTwo = AppDom.byId('step2Admin');
  const clientForm = AppDom.byId('clientLoginForm');
  const nameInput = AppDom.byId('clientName');
  const phoneInput = AppDom.byId('clientPhone');

  if (stepOne) stepOne.style.display = 'block';
  if (stepTwo) stepTwo.style.display = 'none';
  clientForm?.reset();
  switchAuthTab('client');

  if (typeof Auth !== 'undefined') {
    if (nameInput) nameInput.value = Auth.getClientName();
    if (phoneInput) phoneInput.value = Auth.getClientPhone();
  }
}

async function logoutAdmin() {
  if (typeof Auth === 'undefined') return;
  try {
    await Auth.logout();
    App.showPage('store');
    App.updateProfileButton(false);
    showToast('Sesión cerrada', 'info');
  } catch (error) {
    console.error('No se pudo cerrar la sesión:', error);
    showToast('No se pudo cerrar la sesión', 'danger');
  }
}

function initAuthModal() {
  if (typeof Auth === 'undefined') return;

  AppDom.bind(AppDom.byId('profileBtn'), 'click', () => {
    const firebaseUser = typeof auth !== 'undefined' ? auth.currentUser : null;
    const role = Auth.getRole();

    if (firebaseUser && role === 'admin') {
      App.showPage(App.currentPage === 'admin' ? 'store' : 'admin');
      return;
    }

    if (role === 'client') {
      openProfileModal();
      return;
    }

    showAuthChoice();
    AppDom.modal('authModal')?.show();
  });

  AppDom.bind(AppDom.byId('tabClient'), 'click', () => switchAuthTab('client'));
  AppDom.bind(AppDom.byId('tabAdmin'), 'click', () => switchAuthTab('admin'));

  AppDom.bind(AppDom.byId('clientPhone'), 'input', event => {
    event.target.value = sanitizePhone(event.target.value);
  });

  AppDom.bind(AppDom.byId('adminPhone'), 'input', event => {
    event.target.value = sanitizePhone(event.target.value);
  });

  AppDom.bind(AppDom.byId('clientLoginForm'), 'submit', event => {
    event.preventDefault();
    const name = AppDom.byId('clientName')?.value.trim() || '';
    const phone = sanitizePhone(AppDom.byId('clientPhone')?.value);

    if (!name) {
      showToast('Ingresa tu nombre', 'warning');
      AppDom.byId('clientName')?.focus();
      return;
    }

    if (phone && phone.length !== 9) {
      showToast('El teléfono debe tener 9 dígitos', 'warning');
      AppDom.byId('clientPhone')?.focus();
      return;
    }

    Auth.loginClient(name, phone);
    AppDom.modal('authModal')?.hide();
    prefillOrderCustomer(name, phone);
    App.updateProfileButton(false);
    App.showPage('store');
    showToast(`Hola, ${name}`, 'success');
  });

  AppDom.bind(AppDom.byId('sendCodeBtn'), 'click', async () => {
    const phone = sanitizePhone(AppDom.byId('adminPhone')?.value);
    const button = AppDom.byId('sendCodeBtn');

    if (phone.length !== 9) {
      showToast('Ingresa un número válido de 9 dígitos', 'warning');
      AppDom.byId('adminPhone')?.focus();
      return;
    }

    setBusy(button, true, 'Enviando…', '<i class="bi bi-send me-2"></i>Enviar código');
    try {
      await Auth.sendCode(phone, 'recaptchaContainer');
      if (AppDom.byId('step1Admin')) AppDom.byId('step1Admin').style.display = 'none';
      if (AppDom.byId('step2Admin')) AppDom.byId('step2Admin').style.display = 'block';
      AppDom.byId('adminCode')?.focus();
      showToast('Código enviado', 'info');
    } catch (error) {
      console.error('No se pudo enviar el código:', error);
      showToast(error?.message || 'No se pudo enviar el código', 'danger');
    } finally {
      setBusy(button, false, '', '<i class="bi bi-send me-2"></i>Enviar código');
    }
  });

  AppDom.bind(AppDom.byId('verifyCodeBtn'), 'click', async () => {
    const code = String(AppDom.byId('adminCode')?.value || '').replace(/\D/g, '');
    const button = AppDom.byId('verifyCodeBtn');

    if (code.length !== 6) {
      showToast('Ingresa el código de 6 dígitos', 'warning');
      AppDom.byId('adminCode')?.focus();
      return;
    }

    setBusy(button, true, 'Verificando…', '<i class="bi bi-shield-check me-2"></i>Verificar');
    try {
      const user = await Auth.verifyCode(code);
      const isAdmin = await Auth.checkIsAdmin(user);

      if (!isAdmin) {
        await Auth.logout();
        showToast('Este número no tiene permisos de administrador', 'danger');
        return;
      }

      localStorage.setItem('kk_role', 'admin');
      AppDom.modal('authModal')?.hide();
      App.showPage('admin');
      showToast('Sesión de administrador iniciada', 'success');
    } catch (error) {
      console.error('No se pudo verificar el código:', error);
      showToast('Código incorrecto o vencido', 'danger');
    } finally {
      setBusy(button, false, '', '<i class="bi bi-shield-check me-2"></i>Verificar');
    }
  });

  AppDom.bind(AppDom.byId('backToStep1'), 'click', () => {
    if (AppDom.byId('step1Admin')) AppDom.byId('step1Admin').style.display = 'block';
    if (AppDom.byId('step2Admin')) AppDom.byId('step2Admin').style.display = 'none';
    if (AppDom.byId('adminCode')) AppDom.byId('adminCode').value = '';
  });

  ['logoutAdminBtn', 'logoutAdminBtn2', 'logoutAdminMobileBtn'].forEach(id => {
    AppDom.bind(AppDom.byId(id), 'click', event => {
      event.preventDefault();
      logoutAdmin();
    });
  });

  if (!window.__kioscoAuthObserver) {
    window.__kioscoAuthObserver = Auth.onAuthChange(async user => {
      if (!user) {
        if (Auth.getRole() === 'admin') localStorage.removeItem('kk_role');
        if (App.currentPage === 'admin') App.showPage('store');
        return;
      }

      try {
        const isAdmin = await Auth.checkIsAdmin(user);
        if (!isAdmin) {
          await Auth.logout();
          return;
        }

        localStorage.setItem('kk_role', 'admin');
        if (document.readyState !== 'loading') App.showPage('admin');
      } catch (error) {
        console.error('No se pudo validar el rol administrativo:', error);
      }
    });
  }
}

function openProfileModal() {
  if (typeof Auth === 'undefined') return;
  const name = AppDom.byId('profileName');
  const phone = AppDom.byId('profilePhone');
  if (name) name.value = Auth.getClientName();
  if (phone) phone.value = Auth.getClientPhone();
  showProfileTab('info');
  AppDom.modal('profileModal')?.show();
}

function showProfileTab(tabName) {
  document.querySelectorAll('[data-profile-tab]').forEach(button => {
    const active = button.dataset.profileTab === tabName;
    button.classList.toggle('active', active);
    button.classList.toggle('btn-primary', active);
    button.classList.toggle('btn-outline-secondary', !active);
    button.setAttribute('aria-selected', String(active));
  });

  document.querySelectorAll('.profile-pane').forEach(pane => {
    const active = pane.id === `profilePane-${tabName}`;
    pane.classList.toggle('active', active);
    pane.style.display = active ? 'block' : 'none';
  });

  if (tabName === 'orders') loadProfileOrders();
}

function initProfileModal() {
  AppDom.bind(AppDom.byId('profilePhone'), 'input', event => {
    event.target.value = sanitizePhone(event.target.value);
  });

  AppDom.bind(AppDom.byId('saveProfileBtn'), 'click', () => {
    if (typeof Auth === 'undefined') return;
    const name = AppDom.byId('profileName')?.value.trim() || '';
    const phone = sanitizePhone(AppDom.byId('profilePhone')?.value);

    if (!name) {
      showToast('El nombre es obligatorio', 'warning');
      AppDom.byId('profileName')?.focus();
      return;
    }

    if (phone && phone.length !== 9) {
      showToast('El teléfono debe tener 9 dígitos', 'warning');
      AppDom.byId('profilePhone')?.focus();
      return;
    }

    Auth.loginClient(name, phone);
    prefillOrderCustomer(name, phone);
    App.updateProfileButton(false);
    AppDom.modal('profileModal')?.hide();
    showToast('Perfil actualizado', 'success');
  });

  AppDom.bind(AppDom.byId('logoutClientBtn'), 'click', async () => {
    if (typeof Auth === 'undefined') return;
    await Auth.logout();
    AppDom.modal('profileModal')?.hide();
    App.updateProfileButton(false);
    showToast('Sesión cerrada', 'info');
  });

  document.querySelectorAll('[data-profile-tab]').forEach(button => {
    AppDom.bind(button, 'click', () => showProfileTab(button.dataset.profileTab));
  });
}

async function loadProfileOrders() {
  const container = AppDom.byId('profileOrdersList');
  if (!container || typeof Auth === 'undefined') return;

  const name = Auth.getClientName();
  if (!name) {
    container.innerHTML = '<p class="text-muted mb-0">Inicia sesión para consultar tus pedidos.</p>';
    return;
  }

  container.innerHTML = '<div class="text-center py-3"><div class="spinner-border spinner-border-sm" role="status"><span class="visually-hidden">Cargando</span></div></div>';

  try {
    const snapshot = await db.collection(COLL.orders).where('customer', '==', name).get();
    const orders = snapshot.docs
      .map(documentSnapshot => ({ id: documentSnapshot.id, ...documentSnapshot.data() }))
      .sort((left, right) => {
        const leftDate = left.createdAt?.toDate?.() || new Date(0);
        const rightDate = right.createdAt?.toDate?.() || new Date(0);
        return rightDate - leftDate;
      })
      .slice(0, 20);

    if (!orders.length) {
      container.innerHTML = '<p class="text-muted mb-0">Aún no tienes pedidos.</p>';
      return;
    }

    const badgeByStatus = { pending: 'warning', done: 'success', rejected: 'danger' };
    const labelByStatus = { pending: 'Pendiente', done: 'Completado', rejected: 'Rechazado' };

    container.innerHTML = orders.map(order => {
      const date = order.createdAt?.toDate
        ? order.createdAt.toDate().toLocaleString('es-PE', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
        : 'Fecha pendiente';
      const items = (order.items || []).map(item => `${item.name} ×${item.qty}`).join(', ');
      const status = String(order.status || 'pending');
      const badge = badgeByStatus[status] || 'secondary';
      const label = labelByStatus[status] || status;

      return `<article class="card mb-2">
        <div class="card-body p-3">
          <div class="d-flex justify-content-between align-items-center gap-2 mb-1">
            <small class="text-muted">${esc(date)}</small>
            <span class="badge text-bg-${badge}">${esc(label)}</span>
          </div>
          <p class="mb-1 small">${esc(items || 'Sin detalle')}</p>
          <strong class="text-primary">${esc(getCurrency())} ${Number(order.total || 0).toFixed(2)}</strong>
        </div>
      </article>`;
    }).join('');
  } catch (error) {
    console.error('No se pudieron cargar los pedidos del perfil:', error);
    container.innerHTML = `<p class="text-danger small mb-0"><i class="bi bi-exclamation-triangle me-1"></i>${esc(error?.message || 'No se pudieron cargar los pedidos')}</p>`;
  }
}

function updateDeliveryFields() {
  const delivery = document.querySelector('input[name="deliveryType"]:checked')?.value === 'delivery';
  const addressRow = AppDom.byId('addressRow');
  const address = AppDom.byId('orderAddress');

  if (addressRow) addressRow.style.display = delivery ? 'block' : 'none';
  if (address) address.required = delivery;
}

function prefillOrderCustomer(name, phone = '') {
  const nameInput = AppDom.byId('orderCustomerName');
  const phoneInput = AppDom.byId('orderCustomerPhone');
  if (nameInput && name && !nameInput.value.trim()) nameInput.value = name;
  if (phoneInput && phone && !phoneInput.value.trim()) phoneInput.value = phone;
}

function renderOrderSummary() {
  const summary = AppDom.byId('orderSummary');
  if (!summary || typeof Cart === 'undefined') return;

  const items = Cart.getItems();
  summary.innerHTML = items.map(item => `
    <div class="d-flex justify-content-between gap-3 small mb-1">
      <span>${esc(item.name)} ×${Number(item.qty || 0)}</span>
      <span class="text-nowrap">${esc(getCurrency())} ${(Number(item.price || 0) * Number(item.qty || 0)).toFixed(2)}</span>
    </div>`).join('') + `
    <div class="d-flex justify-content-between fw-bold border-top mt-2 pt-2">
      <span>Total</span>
      <span>${esc(getCurrency())} ${Number(Cart.total()).toFixed(2)}</span>
    </div>`;
}

function openOrderModal() {
  if (typeof Cart === 'undefined' || !Cart.count()) {
    showToast('Tu carrito está vacío', 'warning');
    return;
  }

  AppDom.offcanvas('cartOffcanvas')?.hide();

  if (typeof Auth !== 'undefined') {
    prefillOrderCustomer(Auth.getClientName(), Auth.getClientPhone());
  }

  const now = new Date();
  const maximumDate = new Date(now);
  maximumDate.setDate(maximumDate.getDate() + 3);
  const suggestedTime = new Date(now.getTime() + 30 * 60 * 1000);

  const dateInput = AppDom.byId('orderDate');
  const timeInput = AppDom.byId('orderTime');
  const pickup = AppDom.byId('dtPickup');
  const address = AppDom.byId('orderAddress');
  const gpsStatus = AppDom.byId('gpsStatus');

  if (dateInput) {
    dateInput.value = localDateValue(now);
    dateInput.min = localDateValue(now);
    dateInput.max = localDateValue(maximumDate);
  }
  if (timeInput && !timeInput.value) timeInput.value = localTimeValue(suggestedTime);
  if (pickup) pickup.checked = true;
  if (address) {
    address.required = false;
    delete address.dataset.lat;
    delete address.dataset.lng;
  }
  if (gpsStatus) gpsStatus.textContent = '';

  updateDeliveryFields();
  renderOrderSummary();
  AppDom.modal('orderModal')?.show();
}

async function useCurrentLocation() {
  const status = AppDom.byId('gpsStatus');
  const address = AppDom.byId('orderAddress');
  const button = AppDom.byId('useGpsBtn');

  if (!navigator.geolocation) {
    showToast('La geolocalización no está disponible', 'warning');
    return;
  }

  if (status) status.textContent = 'Obteniendo ubicación…';
  if (button) button.disabled = true;

  navigator.geolocation.getCurrentPosition(position => {
    const latitude = position.coords.latitude.toFixed(6);
    const longitude = position.coords.longitude.toFixed(6);

    if (address) {
      address.value = `GPS: ${latitude}, ${longitude}`;
      address.dataset.lat = latitude;
      address.dataset.lng = longitude;
    }

    if (status) {
      status.innerHTML = `<a href="https://www.google.com/maps?q=${encodeURIComponent(`${latitude},${longitude}`)}" target="_blank" rel="noopener noreferrer" class="small">Ver ubicación en Google Maps</a>`;
    }

    if (button) button.disabled = false;
  }, error => {
    console.warn('No se pudo obtener la ubicación:', error);
    if (status) status.textContent = '';
    if (button) button.disabled = false;
    showToast('No se pudo obtener tu ubicación', 'warning');
  }, {
    enableHighAccuracy: true,
    timeout: 12000,
    maximumAge: 60000
  });
}

async function submitOrder() {
  if (typeof Cart === 'undefined') return;

  const name = AppDom.byId('orderCustomerName')?.value.trim() || '';
  const phone = sanitizePhone(AppDom.byId('orderCustomerPhone')?.value);
  const notes = AppDom.byId('orderNotes')?.value.trim() || '';
  const deliveryType = document.querySelector('input[name="deliveryType"]:checked')?.value || 'pickup';
  const addressElement = AppDom.byId('orderAddress');
  const address = addressElement?.value.trim() || '';
  const scheduledDate = AppDom.byId('orderDate')?.value || '';
  const scheduledTime = AppDom.byId('orderTime')?.value || '';
  const button = AppDom.byId('confirmOrderBtn');

  if (!name) {
    showToast('Ingresa tu nombre', 'warning');
    AppDom.byId('orderCustomerName')?.focus();
    return;
  }

  if (phone && phone.length !== 9) {
    showToast('El teléfono debe tener 9 dígitos', 'warning');
    AppDom.byId('orderCustomerPhone')?.focus();
    return;
  }

  if (deliveryType === 'delivery' && !address) {
    showToast('Ingresa la dirección de entrega', 'warning');
    addressElement?.focus();
    return;
  }

  if (!scheduledDate || !scheduledTime) {
    showToast('Selecciona la fecha y hora del pedido', 'warning');
    return;
  }

  const gps = addressElement?.dataset.lat
    ? {
        lat: Number(addressElement.dataset.lat),
        lng: Number(addressElement.dataset.lng)
      }
    : null;

  setBusy(button, true, 'Enviando…', '<i class="bi bi-send me-2"></i>Confirmar Pedido');

  try {
    const orderId = await Cart.checkout(
      name,
      phone,
      notes,
      deliveryType,
      address,
      scheduledDate,
      scheduledTime,
      gps
    );

    if (typeof Auth !== 'undefined' && !Auth.getClientName()) Auth.loginClient(name, phone);
    App.updateProfileButton(false);
    AppDom.modal('orderModal')?.hide();
    showToast(`Pedido enviado: #${String(orderId).slice(-6).toUpperCase()}`, 'success');
  } catch (error) {
    console.error('No se pudo confirmar el pedido:', error);
    showToast(error?.message || 'No se pudo enviar el pedido', 'danger');
  } finally {
    setBusy(button, false, '', '<i class="bi bi-send me-2"></i>Confirmar Pedido');
  }
}

function initOrderModal() {
  ['sendOrderBtn', 'sendOrderBtnMobile'].forEach(id => {
    AppDom.bind(AppDom.byId(id), 'click', openOrderModal);
  });

  document.querySelectorAll('input[name="deliveryType"]').forEach(input => {
    AppDom.bind(input, 'change', updateDeliveryFields);
  });

  AppDom.bind(AppDom.byId('orderCustomerPhone'), 'input', event => {
    event.target.value = sanitizePhone(event.target.value);
  });
  AppDom.bind(AppDom.byId('useGpsBtn'), 'click', useCurrentLocation);
  AppDom.bind(AppDom.byId('confirmOrderBtn'), 'click', submitOrder);
}

function preferredTheme() {
  const saved = localStorage.getItem('kk_theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function setTheme(theme, persist = true) {
  const nextTheme = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-bs-theme', nextTheme);
  document.body?.setAttribute('data-bs-theme', nextTheme);

  if (persist) localStorage.setItem('kk_theme', nextTheme);

  const iconClass = nextTheme === 'dark' ? 'bi bi-sun-fill' : 'bi bi-moon-stars-fill';
  const label = nextTheme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';

  document.querySelectorAll('#themeToggleBtn i, #themeToggleBtn2 i').forEach(icon => {
    icon.className = iconClass;
  });

  ['themeToggleBtn', 'themeToggleBtn2'].forEach(id => {
    const button = AppDom.byId(id);
    if (!button) return;
    button.title = label;
    button.setAttribute('aria-label', label);
  });

  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.content = nextTheme === 'dark' ? '#0d0d14' : '#f97316';

  window.dispatchEvent(new CustomEvent('kiosco:themechange', { detail: { theme: nextTheme } }));
}

function initTheme() {
  setTheme(preferredTheme(), false);

  ['themeToggleBtn', 'themeToggleBtn2'].forEach(id => {
    AppDom.bind(AppDom.byId(id), 'click', () => {
      const current = document.documentElement.getAttribute('data-bs-theme') || 'dark';
      setTheme(current === 'dark' ? 'light' : 'dark');
    });
  });

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleSystemTheme = event => {
    if (localStorage.getItem('kk_theme')) return;
    setTheme(event.matches ? 'dark' : 'light', false);
  };

  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', handleSystemTheme);
  }
}

function isValidHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || ''));
}

function applyBrandLogo(url, emoji) {
  document.querySelectorAll('.logo-icon').forEach(container => {
    container.replaceChildren();

    if (url) {
      const image = document.createElement('img');
      image.src = url;
      image.alt = 'Logo de la tienda';
      image.width = 32;
      image.height = 32;
      image.loading = 'eager';
      image.style.borderRadius = '8px';
      image.style.objectFit = 'cover';
      image.addEventListener('error', () => {
        container.textContent = emoji || '🛍️';
      }, { once: true });
      container.append(image);
      return;
    }

    container.textContent = emoji || '🛍️';
  });
}

async function loadGlobalBranding() {
  if (typeof db === 'undefined' || typeof COLL === 'undefined') return;

  try {
    const snapshot = await db.collection(COLL.config).doc('theme').get();
    if (!snapshot.exists) return;

    const config = snapshot.data() || {};

    if (isValidHexColor(config.accentColor)) {
      const red = parseInt(config.accentColor.slice(1, 3), 16);
      const green = parseInt(config.accentColor.slice(3, 5), 16);
      const blue = parseInt(config.accentColor.slice(5, 7), 16);
      document.documentElement.style.setProperty('--accent', config.accentColor);
      document.documentElement.style.setProperty('--accent-rgb', `${red}, ${green}, ${blue}`);
      document.documentElement.style.setProperty('--bs-primary', config.accentColor);
      document.documentElement.style.setProperty('--bs-primary-rgb', `${red}, ${green}, ${blue}`);
    }

    if (config.storeName) {
      const storeName = String(config.storeName).trim();
      document.querySelectorAll('.logo-text').forEach(element => {
        element.textContent = storeName;
      });
      document.title = storeName;
      if (window.APP_CONFIG) window.APP_CONFIG.storeName = storeName;
    }

    let logoUrl = '';
    if (config.storeLogoUrl) {
      try {
        const parsedUrl = new URL(String(config.storeLogoUrl), window.location.href);
        if (['http:', 'https:'].includes(parsedUrl.protocol)) logoUrl = parsedUrl.href;
      } catch {
        logoUrl = '';
      }
    }

    applyBrandLogo(logoUrl, String(config.storeEmoji || '').trim());
  } catch (error) {
    console.warn('No se pudo cargar la apariencia global:', error?.message || error);
  }
}

let deferredInstallPrompt = null;

function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function updateInstallButton() {
  const button = AppDom.byId('installPwaBtn');
  if (!button) return;

  const visible = Boolean(deferredInstallPrompt) && !isStandaloneMode();
  button.classList.toggle('d-none', !visible);
  button.style.display = visible ? 'inline-flex' : 'none';
  button.disabled = !visible;
  button.setAttribute('aria-hidden', String(!visible));
}

async function promptPwaInstall() {
  if (!deferredInstallPrompt || isStandaloneMode()) {
    updateInstallButton();
    return;
  }

  const button = AppDom.byId('installPwaBtn');
  if (button) button.disabled = true;

  try {
    await deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    if (choice.outcome === 'accepted') showToast('Aplicación instalada', 'success');
  } catch (error) {
    console.error('No se pudo iniciar la instalación:', error);
    showToast('No se pudo iniciar la instalación', 'warning');
  } finally {
    deferredInstallPrompt = null;
    updateInstallButton();
  }
}

function initPwaInstall() {
  updateInstallButton();

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    updateInstallButton();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    updateInstallButton();
    showToast('Aplicación instalada correctamente', 'success');
  });

  AppDom.bind(AppDom.byId('installPwaBtn'), 'click', promptPwaInstall);
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (!['http:', 'https:'].includes(window.location.protocol)) return;

  try {
    const registration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    registration.update().catch(() => {});

    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });

    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          showToast('Nueva versión disponible. Se aplicará al recargar.', 'info');
        }
      });
    });
  } catch (error) {
    console.warn('No se pudo registrar el Service Worker:', error?.message || error);
  }
}

function ensureCategoryOffcanvas() {
  if (AppDom.byId('categoryOffcanvas')) return;

  const element = document.createElement('div');
  element.className = 'offcanvas offcanvas-start';
  element.id = 'categoryOffcanvas';
  element.tabIndex = -1;
  element.setAttribute('aria-labelledby', 'categoryOffcanvasLabel');
  element.innerHTML = `
    <div class="offcanvas-header border-bottom">
      <h5 class="offcanvas-title fw-bold" id="categoryOffcanvasLabel"><i class="bi bi-tags me-2"></i>Categorías</h5>
      <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Cerrar"></button>
    </div>
    <div class="offcanvas-body">
      <ul class="nav flex-column" id="categoryListMobile"></ul>
    </div>`;
  document.body.append(element);
}

function ensureAdminOffcanvas() {
  const adminHeaderActions = document.querySelector('#page-admin .header-actions');

  if (!AppDom.byId('adminMenuBtn') && adminHeaderActions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'adminMenuBtn';
    button.className = 'btn-icon d-lg-none';
    button.title = 'Menú administrativo';
    button.setAttribute('aria-label', button.title);
    button.innerHTML = '<i class="bi bi-list"></i>';
    adminHeaderActions.insertBefore(button, AppDom.byId('backToStoreBtn'));
  }

  if (AppDom.byId('adminOffcanvas')) return;

  const element = document.createElement('div');
  element.className = 'offcanvas offcanvas-start';
  element.id = 'adminOffcanvas';
  element.tabIndex = -1;
  element.setAttribute('aria-labelledby', 'adminOffcanvasLabel');
  element.innerHTML = `
    <div class="offcanvas-header border-bottom">
      <h5 class="offcanvas-title fw-bold" id="adminOffcanvasLabel"><i class="bi bi-grid me-2"></i>Administración</h5>
      <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Cerrar"></button>
    </div>
    <div class="offcanvas-body d-flex flex-column">
      <nav class="nav flex-column" id="adminNavMobile"></nav>
      <button type="button" class="btn btn-outline-danger btn-sm w-100 mt-auto" id="logoutAdminMobileBtn">
        <i class="bi bi-box-arrow-right me-2"></i>Cerrar sesión
      </button>
    </div>`;
  document.body.append(element);
}

function ensureResponsiveElements() {
  ensureCategoryOffcanvas();
  ensureAdminOffcanvas();
}

function syncCategoryMenu() {
  const desktop = AppDom.byId('categoryList');
  const mobile = AppDom.byId('categoryListMobile');
  if (!desktop || !mobile) return;
  mobile.innerHTML = desktop.innerHTML;
}

function syncAdminMenu() {
  const desktop = document.querySelector('.admin-sidebar');
  const mobile = AppDom.byId('adminNavMobile');
  if (!desktop || !mobile) return;

  mobile.replaceChildren();
  desktop.querySelectorAll('[data-admin-section]').forEach(link => {
    const clone = link.cloneNode(true);
    clone.classList.toggle('active', link.classList.contains('active'));
    mobile.append(clone);
  });
}

function closeResponsivePanels() {
  ['categoryOffcanvas', 'adminOffcanvas', 'cartOffcanvas'].forEach(id => {
    const element = AppDom.byId(id);
    if (!element || typeof bootstrap === 'undefined') return;
    bootstrap.Offcanvas.getInstance(element)?.hide();
  });
}

function renderMobileCart() {
  if (typeof Cart === 'undefined') return;

  const items = Cart.getItems() || [];
  const list = AppDom.byId('cartItemsListMobile');
  const empty = AppDom.byId('cartEmptyMobile');
  const footer = AppDom.byId('cartFooterMobile');
  const count = Number(Cart.count() || 0);
  const total = Number(Cart.total() || 0);

  document.querySelectorAll('.cart-count').forEach(element => {
    element.textContent = String(count);
    element.style.display = count > 0 ? 'inline-flex' : 'none';
  });

  if (list) {
    list.innerHTML = items.map(item => {
      const id = esc(item.id);
      const name = esc(item.name);
      const imageUrl = item.imageUrl ? esc(item.imageUrl) : '';
      const quantity = Number(item.qty || 0);
      const price = Number(item.price || 0);
      const subtotal = price * quantity;
      const image = imageUrl
        ? `<img class="cart-item-img" src="${imageUrl}" alt="${name}" width="56" height="56" loading="lazy">`
        : '<div class="cart-item-img-ph d-grid place-items-center" style="width:56px;height:56px"><i class="bi bi-bag"></i></div>';

      return `<article class="cart-item d-flex gap-2 py-2 border-bottom" data-cart-id="${id}">
        ${image}
        <div class="flex-grow-1 min-w-0">
          <div class="fw-semibold small text-truncate">${name}</div>
          <div class="text-muted small">${esc(getCurrency())} ${price.toFixed(2)} c/u</div>
          <div class="small fw-semibold text-primary">Subtotal: ${esc(getCurrency())} ${subtotal.toFixed(2)}</div>
          <div class="d-flex align-items-center gap-1 mt-2">
            <button type="button" class="btn btn-outline-secondary btn-xs" data-cart-action="decrease" aria-label="Disminuir cantidad"><i class="bi bi-dash"></i></button>
            <span class="px-2 fw-bold">${quantity}</span>
            <button type="button" class="btn btn-outline-secondary btn-xs" data-cart-action="increase" aria-label="Aumentar cantidad"><i class="bi bi-plus"></i></button>
            <button type="button" class="btn btn-outline-danger btn-xs ms-auto" data-cart-action="remove" aria-label="Eliminar producto"><i class="bi bi-trash"></i></button>
          </div>
        </div>
      </article>`;
    }).join('');
  }

  if (empty) empty.style.display = items.length ? 'none' : 'block';
  if (footer) footer.hidden = !items.length;

  const formatted = `${getCurrency()} ${total.toFixed(2)}`;
  if (AppDom.byId('cartSubtotalMobile')) AppDom.byId('cartSubtotalMobile').textContent = formatted;
  if (AppDom.byId('cartTotalMobile')) AppDom.byId('cartTotalMobile').textContent = formatted;

  enhanceDesktopCart(items);
}

function enhanceDesktopCart(items) {
  const rows = document.querySelectorAll('#cartItemsList .cart-item');
  rows.forEach((row, index) => {
    const item = items[index];
    if (!item) return;

    let subtotal = row.querySelector('.cart-item-subtotal');
    if (!subtotal) {
      subtotal = document.createElement('div');
      subtotal.className = 'cart-item-subtotal small fw-semibold text-primary';
      row.querySelector('.flex-grow-1')?.append(subtotal);
    }

    subtotal.textContent = `Subtotal: ${getCurrency()} ${(Number(item.price || 0) * Number(item.qty || 0)).toFixed(2)}`;
  });
}

function wrapCartMethods() {
  if (typeof Cart === 'undefined' || Cart.__appWrapped) return;

  ['add', 'remove', 'removeAll', 'clear'].forEach(methodName => {
    const original = Cart[methodName];
    if (typeof original !== 'function') return;

    Cart[methodName] = function wrappedCartMethod(...args) {
      const result = original.apply(Cart, args);
      queueMicrotask(renderMobileCart);
      return result;
    };
  });

  if (typeof Cart.checkout === 'function') {
    const originalCheckout = Cart.checkout;
    Cart.checkout = async function wrappedCheckout(...args) {
      try {
        return await originalCheckout.apply(Cart, args);
      } finally {
        renderMobileCart();
      }
    };
  }

  const originalRender = Cart.render;
  if (typeof originalRender === 'function') {
    Cart.render = function wrappedRender(...args) {
      const result = originalRender.apply(Cart, args);
      queueMicrotask(renderMobileCart);
      return result;
    };
  }

  Cart.__appWrapped = true;
}

function shareCart() {
  if (typeof Cart === 'undefined' || !Cart.count()) {
    showToast('Tu carrito está vacío', 'warning');
    return;
  }

  const storeName = window.APP_CONFIG?.storeName || document.querySelector('.logo-text')?.textContent || 'Kiosco';
  const lines = Cart.getItems().map(item => {
    const subtotal = Number(item.price || 0) * Number(item.qty || 0);
    return `• ${item.name} x${item.qty} — ${getCurrency()} ${subtotal.toFixed(2)}`;
  });

  const message = [
    storeName,
    '',
    ...lines,
    '',
    `Total: ${getCurrency()} ${Number(Cart.total()).toFixed(2)}`
  ].join('\n');

  window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
}

function findDesktopCategoryLink(mobileLink) {
  const category = mobileLink.dataset.cat || '';
  const subcategory = mobileLink.dataset.sub || '';
  return Array.from(document.querySelectorAll('#categoryList .cat-link')).find(link =>
    (link.dataset.cat || '') === category && (link.dataset.sub || '') === subcategory
  );
}

function initResponsiveUi() {
  ensureResponsiveElements();
  syncCategoryMenu();
  syncAdminMenu();

  AppDom.bind(AppDom.byId('sidebarToggleBtn'), 'click', () => {
    syncCategoryMenu();
    AppDom.offcanvas('categoryOffcanvas')?.show();
  });

  AppDom.bind(AppDom.byId('cartMobileBtn'), 'click', () => {
    renderMobileCart();
    AppDom.offcanvas('cartOffcanvas')?.show();
  });

  AppDom.bind(AppDom.byId('adminMenuBtn'), 'click', () => {
    syncAdminMenu();
    AppDom.offcanvas('adminOffcanvas')?.show();
  });

  AppDom.bind(AppDom.byId('clearCartBtnMobile'), 'click', () => {
    if (typeof Cart === 'undefined' || !Cart.count()) return;
    if (window.confirm('¿Vaciar carrito?')) Cart.clear();
  });

  ['shareWhatsappBtn', 'shareWhatsappBtnMobile'].forEach(id => {
    AppDom.bind(AppDom.byId(id), 'click', shareCart);
  });

  document.addEventListener('click', event => {
    const categoryLink = event.target.closest('#categoryListMobile .cat-link');
    if (categoryLink) {
      event.preventDefault();
      findDesktopCategoryLink(categoryLink)?.click();
      AppDom.offcanvas('categoryOffcanvas')?.hide();
      return;
    }

    const adminLink = event.target.closest('#adminNavMobile [data-admin-section]');
    if (adminLink) {
      event.preventDefault();
      const section = adminLink.dataset.adminSection;
      const desktopLink = Array.from(document.querySelectorAll('.admin-sidebar [data-admin-section]'))
        .find(link => link.dataset.adminSection === section);
      desktopLink?.click();
      AppDom.offcanvas('adminOffcanvas')?.hide();
      return;
    }

    const cartAction = event.target.closest('#cartItemsListMobile [data-cart-action]');
    if (cartAction && typeof Cart !== 'undefined') {
      const itemElement = cartAction.closest('[data-cart-id]');
      const id = itemElement?.dataset.cartId;
      if (!id) return;

      const action = cartAction.dataset.cartAction;
      if (action === 'decrease') Cart.remove(id);
      if (action === 'remove') Cart.removeAll(id);
      if (action === 'increase') {
        const item = Cart.getItems().find(product => product.id === id);
        if (item) Cart.add(item);
      }
      return;
    }

    const logo = event.target.closest('.logo-wrap');
    if (logo) {
      event.preventDefault();
      App.showPage('store');
    }
  });

  const categoryList = AppDom.byId('categoryList');
  if (categoryList && !categoryList.__appObserver) {
    const observer = new MutationObserver(syncCategoryMenu);
    observer.observe(categoryList, { childList: true, subtree: true, attributes: true });
    categoryList.__appObserver = observer;
  }

  const adminSidebar = document.querySelector('.admin-sidebar');
  if (adminSidebar && !adminSidebar.__appObserver) {
    const observer = new MutationObserver(syncAdminMenu);
    observer.observe(adminSidebar, { childList: true, subtree: true, attributes: true });
    adminSidebar.__appObserver = observer;
  }
}

function initAdminNavigation() {
  AppDom.bind(AppDom.byId('backToStoreBtn'), 'click', () => App.showPage('store'));
}

function exposeModules() {
  if (typeof Auth !== 'undefined') window.Auth = Auth;
  if (typeof Store !== 'undefined') window.Store = Store;
  if (typeof Cart !== 'undefined') window.Cart = Cart;
  if (typeof Orders !== 'undefined') window.Orders = Orders;
  if (typeof Dashboard !== 'undefined') window.Dashboard = Dashboard;
  if (typeof Admin !== 'undefined') window.Admin = Admin;
}

async function bootstrapApplication() {
  exposeModules();
  initTheme();
  initPwaInstall();
  ensureResponsiveElements();
  initAuthModal();
  initProfileModal();
  initOrderModal();
  initAdminNavigation();
  initResponsiveUi();
  wrapCartMethods();

  if (typeof Auth !== 'undefined') {
    Auth.loadAdminPhones().catch(error => {
      console.warn('No se pudo precargar la lista de administradores:', error?.message || error);
    });
  }

  loadGlobalBranding();
  registerServiceWorker();

  if (typeof Store !== 'undefined') Store.init();
  if (typeof Cart !== 'undefined') Cart.init();

  App.showPage('store');
  renderMobileCart();

  const firebaseUser = typeof auth !== 'undefined' ? auth.currentUser : null;
  if (typeof Auth !== 'undefined' && Auth.getRole() === 'admin' && firebaseUser) {
    App.showPage('admin');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  bootstrapApplication().catch(error => {
    console.error('No se pudo iniciar la aplicación:', error);
    showToast('No se pudo iniciar la aplicación correctamente', 'danger');
  });
});
