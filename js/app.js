// js/app.js — Main orchestrator
'use strict';

// ── Global utilities ──────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const icons = { success: 'check-circle-fill', danger: 'exclamation-triangle-fill', info: 'info-circle-fill', warning: 'exclamation-circle-fill' };
  const colors = { success: 'text-bg-success', danger: 'text-bg-danger', info: 'text-bg-info', warning: 'text-bg-warning' };
  const id = 'toast_' + Date.now();
  c.insertAdjacentHTML('beforeend', `
    <div id="${id}" class="toast align-items-center ${colors[type] || 'text-bg-secondary'} border-0 show" role="alert">
      <div class="d-flex">
        <div class="toast-body"><i class="bi bi-${icons[type] || 'info-circle'} me-2"></i>${msg}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    </div>`);
  const el = document.getElementById(id);
  const t = new bootstrap.Toast(el, { delay: 3500 });
  t.show();
  el.addEventListener('hidden.bs.toast', () => el.remove());
}

function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// ── App state ────────────────────────────────────────────────────────────
const App = (() => {
  let currentPage = 'store';

  function showPage(page) {
    currentPage = page;
    document.querySelectorAll('.page-view').forEach(el => el.classList.remove('active-page'));
    const target = document.getElementById('page-' + page);
    if (target) target.classList.add('active-page');

    if (page === 'admin') {
      Admin.init();
      Dashboard.init();
      Orders.init();
      updateAdminHeaderBtn(true);
    } else {
      updateAdminHeaderBtn(false);
    }
  }

  function updateAdminHeaderBtn(isAdmin) {
    const btn = document.getElementById('profileBtn');
    if (!btn) return;
    if (isAdmin) {
      btn.innerHTML = '<i class="bi bi-tools"></i>';
      btn.title = 'Panel admin';
    } else {
      const name = Auth.getClientName();
      btn.innerHTML = '<i class="bi bi-person-circle"></i>';
      btn.title = name ? `${name} — Mi perfil` : 'Ingresar';
    }
  }

  return { showPage, get currentPage() { return currentPage; } };
})();

// ── Auth Modal (unified: client / admin) ─────────────────────────────────
function initAuthModal() {
  const modal = document.getElementById('authModal');
  const profileBtn = document.getElementById('profileBtn');

  profileBtn?.addEventListener('click', () => {
    const role = Auth.getRole();
    if (role === 'client') {
      // Show profile modal
      openProfileModal();
      return;
    }
    if (auth.currentUser) {
      // Admin already logged in — toggle store/admin
      App.showPage(App.currentPage === 'admin' ? 'store' : 'admin');
      return;
    }
    // Not logged in — show auth choice
    showAuthChoice();
    new bootstrap.Modal(modal).show();
  });

  // Tab switching inside auth modal
  document.getElementById('tabClient')?.addEventListener('click', () => switchAuthTab('client'));
  document.getElementById('tabAdmin')?.addEventListener('click', () => switchAuthTab('admin'));

  // Client login
  document.getElementById('clientLoginForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('clientName').value.trim();
    const phone = document.getElementById('clientPhone').value.trim();
    if (!name) { showToast('Ingresa tu nombre', 'warning'); return; }
    Auth.loginClient(name, phone);
    bootstrap.Modal.getInstance(modal)?.hide();
    prefillCartName(name);
    App.showPage('store');
    showToast(`¡Hola, ${name}! 👋`, 'success');
    App.showPage('store');
  });

  // Admin — send code
  document.getElementById('sendCodeBtn')?.addEventListener('click', async () => {
    const digits = document.getElementById('adminPhone').value.trim();
    if (digits.replace(/\D/g, '').length < 9) { showToast('Número inválido', 'warning'); return; }
    const btn = document.getElementById('sendCodeBtn');
    btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Enviando…';
    try {
      await Auth.sendCode(digits, 'recaptchaContainer');
      document.getElementById('step1Admin').style.display = 'none';
      document.getElementById('step2Admin').style.display = 'block';
      showToast('Código enviado 📱', 'info');
      document.getElementById('adminCode').focus();
    } catch (e) {
      showToast('Error: ' + e.message, 'danger');
    } finally {
      btn.disabled = false; btn.innerHTML = '<i class="bi bi-send me-2"></i>Enviar código';
    }
  });

  // Admin — verify code
  document.getElementById('verifyCodeBtn')?.addEventListener('click', async () => {
    const code = document.getElementById('adminCode').value.trim();
    if (code.length !== 6) { showToast('Código de 6 dígitos', 'warning'); return; }
    const btn = document.getElementById('verifyCodeBtn');
    btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Verificando…';
    try {
      const user = await Auth.verifyCode(code);
      const isAdm = await Auth.checkIsAdmin(user);
      if (isAdm) {
        localStorage.setItem('kk_role', 'admin');
        bootstrap.Modal.getInstance(modal)?.hide();
        App.showPage('admin');
        showToast('Bienvenido, administrador 👋', 'success');
      } else {
        await Auth.logout();
        showToast('Acceso denegado', 'danger');
      }
    } catch (e) {
      showToast('Código incorrecto', 'danger');
    } finally {
      btn.disabled = false; btn.innerHTML = '<i class="bi bi-shield-check me-2"></i>Verificar';
    }
  });

  // Back to step 1
  document.getElementById('backToStep1')?.addEventListener('click', () => {
    document.getElementById('step1Admin').style.display = 'block';
    document.getElementById('step2Admin').style.display = 'none';
  });

  // Logout
  document.getElementById('logoutAdminBtn')?.addEventListener('click', () => {
    Auth.logout().then(() => {
      App.showPage('store');
      showToast('Sesión cerrada', 'info');
    });
  });

  // Firebase auth state
  Auth.onAuthChange(async user => {
    if (user) {
      const isAdm = await Auth.checkIsAdmin(user);
      if (isAdm) {
        localStorage.setItem('kk_role', 'admin');
      } else {
        await Auth.logout();
      }
    }
  });
}

function showAuthChoice() {
  document.getElementById('step1Admin').style.display = 'block';
  document.getElementById('step2Admin').style.display = 'none';
  switchAuthTab('client');
  document.getElementById('clientLoginForm')?.reset();
  // Pre-fill if client was logged in before
  const name = Auth.getClientName();
  if (name) document.getElementById('clientName').value = name;
}

function switchAuthTab(tab) {
  const tabClient = document.getElementById('tabClient');
  const tabAdmin = document.getElementById('tabAdmin');
  const panelClient = document.getElementById('panelClient');
  const panelAdmin = document.getElementById('panelAdmin');
  if (tab === 'client') {
    tabClient?.classList.add('active');
    tabAdmin?.classList.remove('active');
    if (panelClient) panelClient.style.display = 'block';
    if (panelAdmin) panelAdmin.style.display = 'none';
  } else {
    tabAdmin?.classList.add('active');
    tabClient?.classList.remove('active');
    if (panelAdmin) panelAdmin.style.display = 'block';
    if (panelClient) panelClient.style.display = 'none';
  }
}

// ── Profile Modal ─────────────────────────────────────────────────────────
function openProfileModal() {
  const modal = document.getElementById('profileModal');
  if (!modal) return;
  document.getElementById('profileName').value = Auth.getClientName();
  document.getElementById('profilePhone').value = Auth.getClientPhone();
  loadProfileOrders();
  new bootstrap.Modal(modal).show();
}

function initProfileModal() {
  document.getElementById('saveProfileBtn')?.addEventListener('click', () => {
    const name = document.getElementById('profileName').value.trim();
    const phone = document.getElementById('profilePhone').value.trim();
    if (!name) { showToast('Nombre requerido', 'warning'); return; }
    Auth.loginClient(name, phone);
    prefillCartName(name);
    showToast('Perfil guardado ✓', 'success');
    bootstrap.Modal.getInstance(document.getElementById('profileModal'))?.hide();
  });

  document.getElementById('logoutClientBtn')?.addEventListener('click', () => {
    Auth.logout();
    bootstrap.Modal.getInstance(document.getElementById('profileModal'))?.hide();
    showToast('Sesión cerrada', 'info');
    document.getElementById('profileBtn').innerHTML = '<i class="bi bi-person-circle"></i>';
    document.getElementById('profileBtn').title = 'Ingresar';
  });

  document.querySelector('[data-profile-tab]')?.closest('.d-flex')?.querySelectorAll('[data-profile-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-profile-tab]').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const which = tab.dataset.profileTab;
      document.querySelectorAll('.profile-pane').forEach(p => p.style.display = 'none');
      document.getElementById('profilePane-' + which).style.display = 'block';
      if (which === 'orders') loadProfileOrders();
    });
  });
}

async function loadProfileOrders() {
  const el = document.getElementById('profileOrdersList');
  if (!el) return;
  const name = Auth.getClientName();
  if (!name) { el.innerHTML = '<p class="text-muted">Ingresa sesión para ver tus pedidos.</p>'; return; }
  el.innerHTML = '<div class="text-center py-3"><div class="spinner-border spinner-border-sm"></div></div>';
  try {
    // No orderBy — sort in JS to avoid composite index
    const snap = await db.collection(COLL.orders).where('customer', '==', name).get();
    const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const ta = a.createdAt?.toDate?.() || new Date(0);
        const tb = b.createdAt?.toDate?.() || new Date(0);
        return tb - ta;
      }).slice(0, 20);
    if (!orders.length) { el.innerHTML = '<p class="text-muted">Aún no tienes pedidos.</p>'; return; }
    const statusBadge = { pending: 'warning', done: 'success', rejected: 'danger' };
    const statusLabel = { pending: 'Pendiente', done: 'Completado', rejected: 'Rechazado' };
    el.innerHTML = orders.map(o => {
      const dt = o.createdAt?.toDate ? o.createdAt.toDate().toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
      const items = (o.items || []).map(i => `${i.name} ×${i.qty}`).join(', ');
      return `<div class="card mb-2">
        <div class="card-body p-3">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <small class="text-muted">${dt}</small>
            <span class="badge bg-${statusBadge[o.status] || 'secondary'}">${statusLabel[o.status] || o.status}</span>
          </div>
          <p class="mb-1 small">${esc(items)}</p>
          <strong class="text-primary">${APP_CONFIG.currency} ${(o.total || 0).toFixed(2)}</strong>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    el.innerHTML = `<p class="text-danger small"><i class="bi bi-exclamation-triangle me-1"></i>${e.message}</p>`;
    console.warn('profile orders:', e.message);
  }
}

// ── Cart Order Modal ──────────────────────────────────────────────────────
function initOrderModal() {
  document.getElementById('sendOrderBtn')?.addEventListener('click', openOrderModal);
  document.getElementById('sendOrderBtnMobile')?.addEventListener('click', openOrderModal);

  const deliveryTypeInputs = document.querySelectorAll('input[name="deliveryType"]');
  deliveryTypeInputs.forEach(r => r.addEventListener('change', () => {
    const isDelivery = document.querySelector('input[name="deliveryType"]:checked')?.value === 'delivery';
    document.getElementById('addressRow').style.display = isDelivery ? 'block' : 'none';
  }));

  document.getElementById('useGpsBtn')?.addEventListener('click', () => {
    const status = document.getElementById('gpsStatus');
    if (!navigator.geolocation) { showToast('GPS no disponible', 'warning'); return; }
    status.textContent = 'Obteniendo ubicación…';
    navigator.geolocation.getCurrentPosition(pos => {
      const lat = pos.coords.latitude.toFixed(6), lng = pos.coords.longitude.toFixed(6);
      document.getElementById('orderAddress').value = `GPS: ${lat}, ${lng}`;
      status.innerHTML = `<a href="https://maps.google.com?q=${lat},${lng}" target="_blank" class="text-info small">Ver en Google Maps</a>`;
      document.getElementById('orderAddress').dataset.lat = lat;
      document.getElementById('orderAddress').dataset.lng = lng;
    }, () => { status.textContent = ''; showToast('No se pudo obtener ubicación', 'warning'); });
  });

  document.getElementById('confirmOrderBtn')?.addEventListener('click', submitOrder);
}

function openOrderModal() {
  if (!Cart.count()) { showToast('Tu carrito está vacío', 'warning'); return; }
  const name = Auth.getClientName();
  if (name) document.getElementById('orderCustomerName').value = name;
  const phone = Auth.getClientPhone();
  if (phone) document.getElementById('orderCustomerPhone').value = phone;

  // Set default date (today)
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('orderDate').value = today;
  document.getElementById('orderDate').min = today;
  document.getElementById('orderDate').max = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);

  // Summary
  const items = Cart.getItems();
  document.getElementById('orderSummary').innerHTML = items.map(i =>
    `<div class="d-flex justify-content-between small">
      <span>${esc(i.name)} ×${i.qty}</span>
      <span>${APP_CONFIG.currency} ${(i.price * i.qty).toFixed(2)}</span>
    </div>`).join('') + `<div class="d-flex justify-content-between fw-bold border-top mt-2 pt-2">
      <span>Total</span><span>${APP_CONFIG.currency} ${Cart.total().toFixed(2)}</span>
    </div>`;

  new bootstrap.Modal(document.getElementById('orderModal')).show();
}

async function submitOrder() {
  const name = document.getElementById('orderCustomerName').value.trim();
  const phone = document.getElementById('orderCustomerPhone').value.trim();
  const notes = document.getElementById('orderNotes').value.trim();
  const dtype = document.querySelector('input[name="deliveryType"]:checked')?.value || 'pickup';
  const addr = document.getElementById('orderAddress').value.trim();
  const date = document.getElementById('orderDate').value;
  const time = document.getElementById('orderTime').value;
  const addrEl = document.getElementById('orderAddress');
  const gps = addrEl.dataset.lat ? { lat: parseFloat(addrEl.dataset.lat), lng: parseFloat(addrEl.dataset.lng) } : null;

  if (!name) { showToast('Ingresa tu nombre', 'warning'); return; }
  const btn = document.getElementById('confirmOrderBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Enviando…';
  try {
    const id = await Cart.checkout(name, phone, notes, dtype, addr, date, time, gps);
    bootstrap.Modal.getInstance(document.getElementById('orderModal'))?.hide();
    showToast(`¡Pedido enviado! 🎉 #${id.slice(-6).toUpperCase()}`, 'success');
    if (!Auth.getClientName()) Auth.loginClient(name, phone);
  } catch (e) {
    showToast('Error: ' + e.message, 'danger');
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="bi bi-send me-2"></i>Confirmar Pedido';
  }
}

// ── Theme ────────────────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('kk_theme') || 'dark';
  setTheme(saved);
  document.getElementById('themeToggleBtn')?.addEventListener('click', () => {
    const next = document.body.dataset.bsTheme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  });
}

function setTheme(theme) {
  document.body.dataset.bsTheme = theme;
  localStorage.setItem('kk_theme', theme);
  const icon = document.getElementById('themeIcon');
  if (icon) icon.className = theme === 'dark' ? 'bi bi-sun-fill' : 'bi bi-moon-stars-fill';
}

// ── Branding loader ───────────────────────────────────────────────────────
async function loadGlobalBranding() {
  try {
    const doc = await db.collection(COLL.config).doc('theme').get();
    if (!doc.exists) return;
    const d = doc.data();
    if (d.accentColor) {
      const styleEl = document.getElementById('accentStyle') || Object.assign(document.createElement('style'), { id: 'accentStyle' });
      if (!styleEl.parentNode) document.head.appendChild(styleEl);
      const r = parseInt(d.accentColor.slice(1, 3), 16), g = parseInt(d.accentColor.slice(3, 5), 16), b = parseInt(d.accentColor.slice(5, 7), 16);
      styleEl.textContent = `:root{--accent:${d.accentColor};--bs-primary:${d.accentColor};--bs-primary-rgb:${r},${g},${b};}`;
    }
    if (d.storeName) {
      document.querySelectorAll('.logo-text').forEach(el => el.textContent = d.storeName);
      document.title = d.storeName;
      if (window.APP_CONFIG) APP_CONFIG.storeName = d.storeName;
    }
    if (d.storeLogoUrl) {
      document.querySelectorAll('.logo-icon').forEach(el => {
        el.innerHTML = `<img src="${d.storeLogoUrl}" style="width:32px;height:32px;border-radius:6px;object-fit:cover" onerror="this.parentElement.innerHTML='<i class=\\'bi bi-bag-fill\\'></i>'">`;
      });
    } else if (d.storeEmoji) {
      document.querySelectorAll('.logo-icon').forEach(el => el.textContent = d.storeEmoji);
    }
  } catch (e) { console.warn('branding:', e.message); }
}

// ── PWA install ───────────────────────────────────────────────────────────
let deferredInstall = null;
function initPWA() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstall = e;
    const btn = document.getElementById('installPwaBtn');
    if (btn) btn.style.display = 'inline-flex';
  });
  document.getElementById('installPwaBtn')?.addEventListener('click', async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    const { outcome } = await deferredInstall.userChoice;
    if (outcome === 'accepted') {
      document.getElementById('installPwaBtn').style.display = 'none';
      showToast('¡App instalada! 🎉', 'success');
    }
    deferredInstall = null;
  });
}

function prefillCartName(name) {
  document.getElementById('orderCustomerName')?.setAttribute('placeholder', name);
}

// ── Admin nav ─────────────────────────────────────────────────────────────
function initAdminNav() {
  document.getElementById('backToStoreBtn')?.addEventListener('click', () => App.showPage('store'));
  document.getElementById('logoutAdminBtn')?.addEventListener('click', () => {
    Auth.logout().then(() => { App.showPage('store'); showToast('Sesión cerrada', 'info'); });
  });
}

// ── Bootstrap ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initAuthModal();
  initProfileModal();
  initOrderModal();
  initAdminNav();
  initPWA();
  loadGlobalBranding();
  Auth.loadAdminPhones();

  // Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => {
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return; refreshing = true; location.reload();
      });
    }).catch(() => { });
  }

  // Init store
  Store.init();
  Cart.init();
  App.showPage('store');

  // If admin was previously logged in
  if (Auth.getRole() === 'admin' && auth.currentUser) {
    App.showPage('admin');
  }
});
