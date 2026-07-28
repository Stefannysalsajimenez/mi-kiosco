// ===== js/features.js =====
// Módulo unificado: Featured, Chat, Profile, Schedule, Roles, ThemeCustomizer, ETA, Delivery

// ══════════════════════════════════════════════════════════════════════════════
//  FEATURED PRODUCTS
// ══════════════════════════════════════════════════════════════════════════════
const Featured = (() => {
  function render(products) {
    const featured = (products || []).filter(p => p.active && p.featured);
    const container = document.getElementById('featuredSection');
    if (!container) return;
    if (!featured.length) { container.style.display = 'none'; return; }
    container.style.display = 'block';
    const grid = container.querySelector('#featuredGrid');
    if (!grid) return;
    grid.innerHTML = featured.map(p => buildCard(p)).join('');
    grid.querySelectorAll('.product-add-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = featured.find(x => x.id === btn.dataset.id);
        if (p && typeof Cart !== 'undefined') Cart.addItem(p);
      });
    });
    grid.querySelectorAll('.qty-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = featured.find(x => x.id === btn.dataset.id);
        if (!p) return;
        if (btn.dataset.action === 'add') Cart.addItem(p);
        else Cart.removeOne(btn.dataset.id);
      });
    });
  }

  function buildCard(p) {
    const qty = typeof Cart !== 'undefined' ? Cart.getQty(p.id) : 0;
    const isLow = p.stock != null && p.stock <= 5;
    const img = p.imageUrl
      ? `<img src="${p.imageUrl}" alt="${p.name}" loading="lazy"/>`
      : `<span style="font-size:3rem">${p.emoji || '🛍️'}</span>`;
    const ctrl = qty > 0
      ? `<div class="product-qty-control">
          <button class="qty-btn" data-id="${p.id}" data-action="remove">−</button>
          <span class="qty-value">${qty}</span>
          <button class="qty-btn" data-id="${p.id}" data-action="add">+</button>
        </div>`
      : `<button class="product-add-btn" data-id="${p.id}">+</button>`;
    return `<div class="product-card featured" data-id="${p.id}">
      <div class="product-img-wrap">${img}
        <span class="featured-badge">⭐ Destacado</span>
        ${isLow ? `<span class="low-stock-badge">¡Últimas ${p.stock}!</span>` : ''}
      </div>
      <div class="product-info"><p class="product-name">${p.name}</p></div>
      <div class="product-footer">
        <span class="product-price">${APP_CONFIG.currency} ${Number(p.price).toFixed(2)}</span>
        ${ctrl}
      </div>
    </div>`;
  }

  return { render };
})();

// ══════════════════════════════════════════════════════════════════════════════
//  CHAT
// ══════════════════════════════════════════════════════════════════════════════
const Chat = (() => {
  let sessionId   = null;
  let unsubChat   = null;
  let isOpen      = false;
  let unreadCount = 0;

  function getSessionId() {
    if (!sessionId) {
      sessionId = localStorage.getItem('kiosco_chat_session');
      if (!sessionId) {
        sessionId = 'chat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        localStorage.setItem('kiosco_chat_session', sessionId);
      }
    }
    return sessionId;
  }

  function init() {
    const fab = document.getElementById('chatFab');
    if (fab) fab.addEventListener('click', toggle);
    document.getElementById('chatClose')?.addEventListener('click', close);
    document.getElementById('chatSendBtn')?.addEventListener('click', send);
    document.getElementById('chatMsgInput')?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
  }

  function toggle() { isOpen ? close() : open(); }

  function open() {
    isOpen = true; unreadCount = 0; updateBadge();
    document.getElementById('chatWindow')?.classList.remove('hidden');
    subscribe(getSessionId());
    setTimeout(() => document.getElementById('chatMsgInput')?.focus(), 100);
  }

  function close() {
    isOpen = false;
    document.getElementById('chatWindow')?.classList.add('hidden');
    if (unsubChat) { unsubChat(); unsubChat = null; }
  }

  function subscribe(sid) {
    if (unsubChat) unsubChat();
    unsubChat = db.collection('chats').doc(sid).collection('messages')
      .orderBy('createdAt', 'asc').limit(100)
      .onSnapshot(snap => {
        render(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        if (!isOpen) {
          const newMsgs = snap.docChanges().filter(c => c.type === 'added' && c.doc.data().sender !== 'customer');
          if (newMsgs.length) { unreadCount += newMsgs.length; updateBadge(); }
        }
      });
  }

  function render(messages) {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    container.innerHTML = messages.map(m => {
      const time = m.createdAt?.toDate
        ? m.createdAt.toDate().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '';
      const isOwn = m.sender === 'customer';
      return `<div class="chat-msg ${isOwn ? 'sent' : 'received'}">
        ${!isOwn ? '<span style="font-size:.7rem;opacity:.7">Admin · </span>' : ''}
        ${esc(m.text)}
        <div class="msg-time">${time}</div>
      </div>`;
    }).join('');
    container.scrollTop = container.scrollHeight;
  }

  async function send() {
    const input = document.getElementById('chatMsgInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    try {
      const sid = getSessionId();
      await db.collection('chats').doc(sid).collection('messages').add({
        text, sender: 'customer',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      await db.collection('chats').doc(sid).set({
        lastMessage: text, lastSender: 'customer',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        unreadAdmin: true
      }, { merge: true });
    } catch (e) { showToast('Error al enviar', 'error'); }
  }

  function updateBadge() {
    const badge = document.getElementById('chatUnreadBadge');
    if (!badge) return;
    badge.textContent = unreadCount;
    badge.style.display = unreadCount > 0 ? 'flex' : 'none';
  }

  function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  return { init, open, close, toggle, send };
})();

// ══════════════════════════════════════════════════════════════════════════════
//  PROFILE (historial cliente)
// ══════════════════════════════════════════════════════════════════════════════
const CustomerProfile = (() => {
  function init() {
    document.getElementById('profileBtn')?.addEventListener('click', openModal_);
    document.getElementById('historyModal')?.addEventListener('click', e => {
      if (e.target.id === 'historyModal') closeModal(document.getElementById('historyModal'));
    });
    document.getElementById('closeHistoryModal')?.addEventListener('click', () =>
      closeModal(document.getElementById('historyModal')));
  }

  async function openModal_() {
    openModal(document.getElementById('historyModal'));
    const list = document.getElementById('historyList');
    if (!list) return;

    const name = Auth?.getUserName?.() || localStorage.getItem('kiosco_user_name') || '';
    if (!name) {
      list.innerHTML = `<div class="empty-state"><p>Ingresa tu nombre para ver tu historial</p></div>`;
      return;
    }
    list.innerHTML = `<div class="skeleton" style="height:80px;border-radius:8px;margin-bottom:8px"></div>
                      <div class="skeleton" style="height:80px;border-radius:8px"></div>`;
    try {
      const snap = await db.collection(COLL.orders).where('customer', '==', name)
        .orderBy('createdAt', 'desc').limit(20).get();
      const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (!orders.length) {
        list.innerHTML = `<div class="empty-state"><div class="empty-icon">📦</div><p>Aún no tienes pedidos</p></div>`;
        return;
      }
      const icon = { pending: '⏳', done: '✅', rejected: '❌' };
      list.innerHTML = orders.map(o => {
        const date = o.createdAt?.toDate
          ? o.createdAt.toDate().toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
        const items = (o.items || []).map(i => `${i.name} ×${i.qty}`).join(', ');
        return `<div class="order-history-item">
          <div class="oh-header">
            <span style="font-weight:700">${date}</span>
            <span>${icon[o.status] || ''} ${o.status}</span>
          </div>
          <p style="font-size:.82rem;color:var(--text-2);margin:.25rem 0">${items}</p>
          <p style="font-weight:700;color:var(--accent)">${APP_CONFIG.currency} ${(o.total || 0).toFixed(2)}</p>
        </div>`;
      }).join('');
    } catch {
      list.innerHTML = `<div class="empty-state"><p>Error al cargar historial</p></div>`;
    }
  }

  return { init };
})();

// ══════════════════════════════════════════════════════════════════════════════
//  DELIVERY (dirección de entrega)
// ══════════════════════════════════════════════════════════════════════════════
const Delivery = (() => {
  function getAddress() { return localStorage.getItem('kiosco_customer_address') || ''; }

  function injectIntoCartFooter() {
    // Inject delivery section into cart is handled by cart.js openOrderModal
  }

  return { getAddress, injectIntoCartFooter };
})();

// ══════════════════════════════════════════════════════════════════════════════
//  ETA / DELIVERY TIME
// ══════════════════════════════════════════════════════════════════════════════
const DeliveryTime = (() => {
  async function load() {
    try {
      const doc = await db.collection(COLL.config).doc('settings').get();
      if (!doc.exists) return;
      const eta = doc.data().etaMinutes;
      const el  = document.getElementById('deliveryTimeBanner');
      if (el && eta) {
        el.innerHTML = `<span style="display:inline-flex;align-items:center;gap:.4rem;background:var(--info);color:#fff;font-size:.75rem;font-weight:700;padding:.28rem .7rem;border-radius:99px">⏱️ Tiempo estimado: ${eta} min</span>`;
        el.style.display = 'flex';
        el.style.justifyContent = 'center';
        el.style.padding = '.5rem 1.25rem';
      }
    } catch {}
  }
  return { load };
})();

// ══════════════════════════════════════════════════════════════════════════════
//  SCHEDULE CHECK (tienda abierta/cerrada)
// ══════════════════════════════════════════════════════════════════════════════
const Schedule = (() => {
  async function load() {
    try {
      const doc = await db.collection(COLL.config).doc('settings').get();
      if (!doc.exists) return;
      const schedule = doc.data().schedule;
      if (!schedule) return;
      const now    = new Date();
      const dayIdx = (now.getDay() + 6) % 7;
      const day    = schedule[dayIdx];
      if (!day?.open) { showClosedBanner(); return; }
      const [oh, om] = (day.from || '00:00').split(':').map(Number);
      const [ch, cm] = (day.to   || '23:59').split(':').map(Number);
      const nowMins  = now.getHours() * 60 + now.getMinutes();
      if (nowMins < oh * 60 + om || nowMins > ch * 60 + cm) showClosedBanner();
    } catch {}
  }

  function showClosedBanner() {
    const el = document.getElementById('closedBanner');
    if (el) el.style.display = 'block';
  }

  return { load };
})();

// ══════════════════════════════════════════════════════════════════════════════
//  BRANDING (carga tema guardado)
// ══════════════════════════════════════════════════════════════════════════════
const Branding = (() => {
  async function load() {
    try {
      const doc = await db.collection(COLL.config).doc('theme').get();
      if (!doc.exists) return;
      const d = doc.data();
      if (d.accentColor) {
        document.documentElement.style.setProperty('--accent', d.accentColor);
        const r = parseInt(d.accentColor.slice(1,3),16);
        const g = parseInt(d.accentColor.slice(3,5),16);
        const b = parseInt(d.accentColor.slice(5,7),16);
        document.documentElement.style.setProperty('--accent-glow', `rgba(${r},${g},${b},.22)`);
      }
      if (d.storeName) {
        const lt = document.querySelector('.logo-text');
        if (lt) lt.textContent = d.storeName;
        if (typeof APP_CONFIG !== 'undefined') APP_CONFIG.storeName = d.storeName;
        document.title = d.storeName;
      }
      if (d.storeEmoji) {
        const li = document.querySelector('.logo-icon');
        if (li) li.textContent = d.storeEmoji;
      }
    } catch {}
  }
  return { load };
})();

// ══════════════════════════════════════════════════════════════════════════════
//  I18n (idioma)
// ══════════════════════════════════════════════════════════════════════════════
const I18n = (() => {
  let lang = localStorage.getItem('kiosco_lang') || 'es';

  function initToggle() {
    const btn = document.getElementById('langToggleBtn');
    if (!btn) return;
    btn.innerHTML = lang === 'es' ? '🇬🇧 EN' : '🇵🇪 ES';
    btn.addEventListener('click', () => {
      lang = lang === 'es' ? 'en' : 'es';
      localStorage.setItem('kiosco_lang', lang);
      btn.innerHTML = lang === 'es' ? '🇬🇧 EN' : '🇵🇪 ES';
      showToast(lang === 'es' ? '🇵🇪 Español activado' : '🇬🇧 English activated', 'info');
    });
  }

  return { initToggle, get current() { return lang; } };
})();
