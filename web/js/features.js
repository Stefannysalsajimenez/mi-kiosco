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

// ===== INICIO FUNCIONALIDADES INTEGRADAS =====
// ===== Funcionalidad integrada: media =====
'use strict';

(() => {
  const MAX_INPUT_BYTES = 10 * 1024 * 1024;
  const MAX_OUTPUT_BYTES = 800 * 1024;
  const TARGET_OUTPUT_BYTES = 500 * 1024;
  const MAX_DIMENSION = 1600;
  const REPOSITORY_PREFIX = 'repo:';
  const CLOUDINARY_PREFIX = 'cloudinary:'; // compatibilidad histórica
  const IMAGE_EXTENSIONS = new Set([
    'jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'avif', 'bmp', 'heic', 'heif',
    'tif', 'tiff', 'ico', 'jxl'
  ]);

  function sanitizeSegment(value, fallback = 'item') {
    const cleaned = String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80);
    return cleaned || fallback;
  }

  function config() {
    const raw = window.KIOSCO_UPGRADE_CONFIG || {};
    const configured = String(raw.apiBaseUrl || '').trim().replace(/\/+$/, '');
    const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    return {
      apiBaseUrl: configured || (isLocal ? 'http://localhost:3000' : ''),
      storeUrl: String(raw.storeUrl || location.origin || '').trim().replace(/\/+$/, ''),
      maxInputBytes: Math.max(1024 * 1024, Number(raw.mediaMaxInputBytes || MAX_INPUT_BYTES)),
      maxOutputBytes: Math.max(200 * 1024, Number(raw.mediaMaxOutputBytes || MAX_OUTPUT_BYTES)),
      targetOutputBytes: Math.max(120 * 1024, Number(raw.mediaTargetOutputBytes || TARGET_OUTPUT_BYTES)),
      maxDimension: Math.max(640, Number(raw.mediaMaxDimension || MAX_DIMENSION))
    };
  }

  function assertConfigured() {
    const current = config();
    if (!current.apiBaseUrl) {
    }
    return current;
  }

  async function validate(file, maxBytes = config().maxInputBytes) {
    if (!file || file.size === 0) throw new Error('Selecciona una imagen válida.');
    if (file.size > maxBytes) {
      throw new Error(`La imagen original no debe superar ${Math.round(maxBytes / 1024 / 1024)} MB.`);
    }

    const extension = String(file.name || '').split('.').pop()?.toLowerCase() || '';
    const mime = String(file.type || '').toLowerCase();
    if (!mime.startsWith('image/') && !IMAGE_EXTENSIONS.has(extension)) {
      throw new Error('El archivo seleccionado no es una imagen compatible.');
    }

    if (extension === 'svg' || mime === 'image/svg+xml') {
      const source = await file.text();
      if (!/<svg[\s>]/i.test(source) || /<script[\s>]/i.test(source) || /\son[a-z]+\s*=/i.test(source)) {
        throw new Error('El SVG contiene código no permitido.');
      }
    }
    return file;
  }

  function loadImageFromBlob(blob) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(blob);
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve({ image, objectUrl });
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Tu navegador no puede procesar este formato. Prueba con JPG, PNG, WEBP o AVIF.'));
      };
      image.src = objectUrl;
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (!blob) {
          reject(new Error('No se pudo optimizar la imagen en este navegador.'));
          return;
        }
        resolve(blob);
      }, type, quality);
    });
  }

  function dimensions(width, height, maxDimension) {
    const largest = Math.max(width, height);
    if (!largest || largest <= maxDimension) return { width, height };
    const scale = maxDimension / largest;
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale))
    };
  }

  async function optimize(file, options = {}) {
    await validate(file, options.maxInputBytes || config().maxInputBytes);
    const current = config();
    const maxDimension = Number(options.maxDimension || current.maxDimension);
    const targetBytes = Number(options.targetBytes || current.targetOutputBytes);
    const maxOutputBytes = Number(options.maxOutputBytes || current.maxOutputBytes);
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};

    onProgress(5);
    const decoded = await loadImageFromBlob(file);
    try {
      const sourceWidth = decoded.image.naturalWidth || decoded.image.width;
      const sourceHeight = decoded.image.naturalHeight || decoded.image.height;
      if (!sourceWidth || !sourceHeight) throw new Error('No se pudieron leer las dimensiones de la imagen.');

      let size = dimensions(sourceWidth, sourceHeight, maxDimension);
      let best = null;
      const qualities = [0.84, 0.78, 0.72, 0.66, 0.60, 0.54];

      for (let scaleRound = 0; scaleRound < 4; scaleRound += 1) {
        const canvas = document.createElement('canvas');
        canvas.width = size.width;
        canvas.height = size.height;
        const context = canvas.getContext('2d', { alpha: true });
        if (!context) throw new Error('El navegador no puede procesar imágenes con Canvas.');
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(decoded.image, 0, 0, size.width, size.height);

        for (let i = 0; i < qualities.length; i += 1) {
          onProgress(Math.min(38, 10 + scaleRound * 7 + i * 2));
          const candidate = await canvasToBlob(canvas, 'image/webp', qualities[i]);
          if (!best || candidate.size < best.blob.size) {
            best = { blob: candidate, width: size.width, height: size.height, quality: qualities[i] };
          }
          if (candidate.size <= targetBytes) break;
        }

        if (best?.blob.size <= maxOutputBytes) break;
        size = {
          width: Math.max(640, Math.round(size.width * 0.86)),
          height: Math.max(640, Math.round(size.height * 0.86))
        };
      }

      if (!best?.blob) throw new Error('No se pudo generar la imagen optimizada.');
      if (best.blob.size > maxOutputBytes) {
        throw new Error(`La imagen optimizada todavía supera ${Math.round(maxOutputBytes / 1024)} KB. Usa una imagen con menor complejidad.`);
      }

      onProgress(40);
      return {
        blob: best.blob,
        mimeType: 'image/webp',
        extension: 'webp',
        width: best.width,
        height: best.height,
        originalBytes: file.size,
        optimizedBytes: best.blob.size
      };
    } finally {
      URL.revokeObjectURL(decoded.objectUrl);
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const value = String(reader.result || '');
        const separator = value.indexOf(',');
        resolve(separator >= 0 ? value.slice(separator + 1) : value);
      };
      reader.onerror = () => reject(new Error('No se pudo preparar la imagen para enviarla.'));
      reader.readAsDataURL(blob);
    });
  }

  async function requestMedia(payload, options = {}) {
    const current = assertConfigured();
    const user = window.auth?.currentUser;
    if (!user) throw new Error('Debes iniciar sesión como administrador para gestionar imágenes.');
    const token = await user.getIdToken(true);
    const endpoint = `${current.apiBaseUrl}/api/media`;
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', endpoint, true);
      xhr.timeout = Number(options.timeoutMs || 90000);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      xhr.upload.addEventListener('progress', event => {
        if (!event.lengthComputable) return;
        const percent = 45 + Math.round((event.loaded / event.total) * 35);
        onProgress(Math.min(80, percent));
      });
      xhr.addEventListener('load', () => {
        let body = {};
        try { body = JSON.parse(xhr.responseText || '{}'); } catch { /* respuesta inválida */ }
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(body?.error || `No se pudo publicar la imagen (HTTP ${xhr.status || 0}).`));
          return;
        }
        onProgress(100);
        resolve(body);
      });
      xhr.addEventListener('error', () => reject(new Error('No se pudo conectar con el backend de Kiosco.')));
      xhr.addEventListener('timeout', () => reject(new Error('La publicación tardó demasiado. Inténtalo nuevamente.')));
      xhr.addEventListener('abort', () => reject(new Error('La publicación fue cancelada.')));
      xhr.send(JSON.stringify(payload));
    });
  }

  async function upload(file, options = {}) {
    const current = config();
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
    const optimized = await optimize(file, {
      maxInputBytes: options.maxBytes || current.maxInputBytes,
      maxOutputBytes: options.maxOutputBytes || current.maxOutputBytes,
      targetBytes: options.targetBytes || current.targetOutputBytes,
      maxDimension: options.maxDimension || current.maxDimension,
      onProgress
    });
    const contentBase64 = await blobToBase64(optimized.blob);
    onProgress(44);

    const result = await requestMedia({
      action: 'upload',
      scope: sanitizeSegment(options.scope || 'general', 'general'),
      entityId: sanitizeSegment(options.entityId || 'sin-id', 'sin-id'),
      filename: String(file.name || 'imagen').slice(0, 180),
      mimeType: optimized.mimeType,
      extension: optimized.extension,
      contentBase64,
      width: optimized.width,
      height: optimized.height,
      originalBytes: optimized.originalBytes,
      optimizedBytes: optimized.optimizedBytes
    }, { onProgress, timeoutMs: options.timeoutMs });

    return {
      url: result.url,
      path: result.path,
      commitSha: result.commitSha || null,
      commitUrl: result.commitUrl || null,
      mode: result.mode || 'repository',
      pendingDeploy: Boolean(result.pendingDeploy),
      bytes: optimized.optimizedBytes,
      originalBytes: optimized.originalBytes,
      width: optimized.width,
      height: optimized.height,
      format: optimized.extension
    };
  }

  async function remove(path, options = {}) {
    if (!isRepositoryPath(path)) return { ok: true, skipped: true };
    return requestMedia({ action: 'delete', path: String(path) }, options);
  }

  function repositoryPath(filePath) {
    const clean = String(filePath || '').replace(/^\/+/, '');
    return clean ? `${REPOSITORY_PREFIX}${clean}` : null;
  }

  function isRepositoryPath(path) {
    return String(path || '').startsWith(REPOSITORY_PREFIX);
  }

  function isCloudinaryPath(path) {
    return String(path || '').startsWith(CLOUDINARY_PREFIX);
  }

  function publicUrlForPath(path, version = '') {
    if (!isRepositoryPath(path)) return null;
    const raw = String(path).slice(REPOSITORY_PREFIX.length).replace(/^web\//, '');
    const relative = `/${raw.replace(/^\/+/, '')}`;
    const suffix = version ? `?v=${encodeURIComponent(version)}` : '';
    return `${relative}${suffix}`;
  }

  window.KioscoMedia = Object.freeze({
    MAX_INPUT_BYTES,
    MAX_OUTPUT_BYTES,
    TARGET_OUTPUT_BYTES,
    MAX_DIMENSION,
    validate,
    optimize,
    upload,
    remove,
    repositoryPath,
    isRepositoryPath,
    isCloudinaryPath,
    publicUrlForPath,
    config
  });
})();

// ===== Funcionalidad integrada: receipts appearance =====
'use strict';

(() => {
  const UPGRADE_CONFIG = Object.assign({ apiBaseUrl: '' }, window.KIOSCO_UPGRADE_CONFIG || {});
  const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
  const COMPATIBLE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'avif', 'bmp', 'ico', 'heic', 'heif', 'tif', 'tiff', 'jxl']);
  const state = {
    theme: {},
    billing: {},
    logoFile: null,
    logoPreviewUrl: null,
    receiptsUnsubscribe: null,
    proofsUnsubscribe: null,
    publicUnsubscribe: null,
    receiptPeriod: 'today',
    adminOrders: [],
    paymentProofs: new Map()
  };

  function html(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function toast(message, type = 'info') {
    if (typeof window.showToast === 'function') window.showToast(message, type);
    else console.info(`[Kiosco:${type}]`, message);
  }

  function apiBaseUrl() {
    const value = String(UPGRADE_CONFIG.apiBaseUrl || "").trim().replace(/\/$/, "");
    return /^https:\/\//i.test(value) && !value.includes("REEMPLAZAR") ? value : "";
  }

  function localReceiptUrl(order, autoPrint = false) {
    const token = order?.billing?.publicToken;
    if (!order?.id || !token) return "";
    const url = new URL("/", String(UPGRADE_CONFIG.storeUrl || location.origin));
    url.hash = "";
    url.search = "";
    url.searchParams.set("receiptOrder", order.id);
    url.searchParams.set("receiptToken", token);
    if (autoPrint) url.searchParams.set("print", "1");
    return url.href;
  }

  function publicReceiptUrl(order, autoPrint = false) {
    const token = order?.billing?.publicToken;
    if (!order?.id || !token) return "";
    const base = apiBaseUrl();
    if (base) return base + "/api/boleta?orderId=" + encodeURIComponent(order.id) + "&token=" + encodeURIComponent(token);
    return localReceiptUrl(order, autoPrint);
  }

  const RECEIPT_RETURN_KEY = 'kioscoReceiptReturnUrl';

  function rememberReceiptReturnUrl() {
    sessionStorage.setItem(RECEIPT_RETURN_KEY, location.href);
  }

  function returnFromReceipt() {
    const returnUrl = sessionStorage.getItem(RECEIPT_RETURN_KEY);
    sessionStorage.removeItem(RECEIPT_RETURN_KEY);

    if (returnUrl) {
      try {
        const parsed = new URL(returnUrl, location.origin);
        if (parsed.origin === location.origin) {
          location.assign(parsed.href);
          return;
        }
      } catch { /* ignore invalid stored URL */ }
    }

    if (history.length > 1) {
      history.back();
      return;
    }

    location.assign(new URL('/', String(UPGRADE_CONFIG.storeUrl || location.origin)).href);
  }
  async function adminApi(path, options = {}) {
    const base = apiBaseUrl();
    const user = window.auth?.currentUser;
    if (!user) throw new Error('Inicia sesión como administrador');
    const response = await fetch(`${base}${path}`, {
      method: options.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await user.getIdToken()}`
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try { message = (await response.json()).error || message; } catch { /* ignore */ }
      throw new Error(message);
    }
    return response;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.target = '_blank';
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function sanitizeFileName(name) {
    return String(name || 'imagen')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .replace(/-+/g, '-')
      .toLowerCase();
  }

  async function normalizeImage(file) {
    if (!file || file.size === 0) throw new Error('Selecciona una imagen válida');
    if (file.size > MAX_IMAGE_SIZE) throw new Error('La imagen original no debe superar 10 MB');
    const extension = String(file.name || '').split('.').pop()?.toLowerCase() || '';
    const mime = String(file.type || '').toLowerCase();
    if (!mime.startsWith('image/') && !COMPATIBLE_EXTENSIONS.has(extension)) throw new Error('El archivo seleccionado no es una imagen compatible');
    if (extension === 'svg' || mime === 'image/svg+xml') {
      const source = await file.text();
      if (!/<svg[\s>]/i.test(source) || /<script[\s>]/i.test(source) || /\son[a-z]+\s*=/i.test(source)) throw new Error('El SVG contiene código no permitido');
    }
    return file;
  }

  async function uploadLogo(file) {
    if (!window.auth?.currentUser) throw new Error('Solo el administrador puede subir imágenes');
    if (!window.KioscoMedia?.upload) throw new Error('El módulo de imágenes no está disponible. Recarga la aplicación.');
    const normalized = await normalizeImage(file);
    const asset = await window.KioscoMedia.upload(normalized, {
      scope: 'branding',
      entityId: 'logo',
      maxBytes: MAX_IMAGE_SIZE
    });
    return { path: asset.path, url: asset.url, pendingDeploy: asset.pendingDeploy };
  }
  async function deleteStorageFile(path) {
    if (!path) return;
    if (window.KioscoMedia?.isRepositoryPath?.(path)) {
      try { await window.KioscoMedia.remove(path); }
      catch (error) { console.warn('Logo del repositorio:', error?.message || error); }
      return;
    }
    if (window.KioscoMedia?.isCloudinaryPath?.(path) || String(path).startsWith('cloudinary:')) return;
    if (!window.storage) return;
    try { await window.storage.ref(path).delete(); }
    catch (error) { if (error?.code !== 'storage/object-not-found') console.warn('Logo anterior:', error); }
  }

  function applyLiveTheme(theme) {
    if (theme.storeName) {
      document.querySelectorAll('.logo-text').forEach(element => { element.textContent = theme.storeName; });
      document.title = theme.storeName;
      if (window.APP_CONFIG) window.APP_CONFIG.storeName = theme.storeName;
    }
    if (/^#[0-9a-f]{6}$/i.test(String(theme.accentColor || ''))) {
      const color = theme.accentColor;
      const rgb = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16)).join(',');
      document.documentElement.style.setProperty('--accent', color);
      document.documentElement.style.setProperty('--accent-rgb', rgb);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
    }
    document.querySelectorAll('.logo-icon').forEach(element => {
      if (theme.storeLogoUrl) {
        element.innerHTML = `<img src="${html(theme.storeLogoUrl)}" alt="Logo" class="kiosk-live-logo">`;
      } else {
        element.textContent = theme.storeEmoji || '🛍️';
      }
    });
  }

  function createAppearanceUpgrade() {
    const section = document.getElementById('sec-apariencia');
    if (!section || document.getElementById('kioskAppearanceUpgrade')) return;
    const legacy = document.getElementById('brandingForm')?.closest('.card');
    if (legacy) legacy.hidden = true;

    const wrapper = document.createElement('div');
    wrapper.id = 'kioskAppearanceUpgrade';
    wrapper.innerHTML = `
      <div class="row g-3">
        <div class="col-xl-7">
          <div class="card h-100">
            <div class="card-header fw-bold"><i class="bi bi-shop me-2"></i>Identidad pública</div>
            <div class="card-body">
              <div class="row g-3">
                <div class="col-md-7"><label class="form-label fw-semibold">Nombre de la tienda</label><input id="kBrandName" class="form-control" maxlength="60"></div>
                <div class="col-md-5"><label class="form-label fw-semibold">Texto corto</label><input id="kBrandTagline" class="form-control" maxlength="90" placeholder="Productos actualizados en tiempo real"></div>
                <div class="col-md-4"><label class="form-label fw-semibold">Color principal</label><input id="kBrandColor" type="color" class="form-control form-control-color w-100"></div>
                <div class="col-md-4"><label class="form-label fw-semibold">Emoji alternativo</label><input id="kBrandEmoji" class="form-control" maxlength="8" placeholder="🛍️"></div>
                <div class="col-md-4"><label class="form-label fw-semibold">ETA (min)</label><input id="kBrandEta" type="number" min="1" max="180" class="form-control"></div>
                <div class="col-12">
                  <label class="form-label fw-semibold">Logo desde el dispositivo</label>
                  <input id="kBrandLogoFile" type="file" class="form-control" accept="image/*,.svg,.avif,.heic,.heif,.tif,.tiff,.bmp,.ico,.jxl">
                  <div class="form-text">Selecciona el logo desde este dispositivo. Kiosco lo optimiza y lo guarda en web/uploads/branding del repositorio. Máximo original: 10 MB.</div>
                </div>
                <div class="col-12"><label class="form-label fw-semibold">URL alternativa del logo</label><input id="kBrandLogoUrl" type="url" class="form-control" placeholder="https://..."></div>
                <div class="col-12 d-flex gap-2 flex-wrap">
                  <button id="kSaveAppearance" class="btn btn-primary" type="button"><i class="bi bi-cloud-arrow-up me-2"></i>Guardar y publicar</button>
                  <button id="kRemoveLogo" class="btn btn-outline-danger" type="button"><i class="bi bi-trash me-2"></i>Quitar logo</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-xl-5">
          <div class="card h-100">
            <div class="card-header fw-bold"><i class="bi bi-phone me-2"></i>Vista pública en tiempo real</div>
            <div class="card-body d-flex align-items-center justify-content-center">
              <div class="kiosk-brand-preview">
                <div id="kBrandPreviewLogo" class="kiosk-brand-preview-logo">🛍️</div>
                <div id="kBrandPreviewName" class="kiosk-brand-preview-name">Kiosco</div>
                <div id="kBrandPreviewTagline" class="kiosk-brand-preview-tagline">Productos actualizados en tiempo real.</div>
                <button id="kBrandPreviewButton" type="button" disabled>Agregar al carrito</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="card mt-3">
        <div class="card-header fw-bold"><i class="bi bi-receipt-cutoff me-2"></i>Datos del recibo</div>
        <div class="card-body">
          <div class="row g-3">
            <div class="col-md-6"><label class="form-label fw-semibold">Razón social / negocio</label><input id="kBillingName" class="form-control" maxlength="120"></div>
            <div class="col-md-3"><label class="form-label fw-semibold">RUC</label><input id="kBillingRuc" class="form-control" inputmode="numeric" maxlength="11"></div>
            <div class="col-md-3"><label class="form-label fw-semibold">Serie</label><input id="kBillingSeries" class="form-control text-uppercase" maxlength="10" placeholder="B001"></div>
            <div class="col-md-6"><label class="form-label fw-semibold">Dirección</label><input id="kBillingAddress" class="form-control" maxlength="180"></div>
            <div class="col-md-3"><label class="form-label fw-semibold">Teléfono</label><input id="kBillingPhone" class="form-control" maxlength="30"></div>
            <div class="col-md-3"><label class="form-label fw-semibold">Correo</label><input id="kBillingEmail" type="email" class="form-control" maxlength="120"></div>
            <div class="col-md-6"><label class="form-label fw-semibold">Título del documento</label><input id="kBillingTitle" class="form-control" maxlength="40" placeholder="RECIBO DE VENTA"></div>
            <div class="col-md-3"><label class="form-label fw-semibold">Siguiente número</label><input id="kBillingNext" type="number" min="1" class="form-control"></div>
            <div class="col-md-3 d-flex align-items-end"><div class="form-check form-switch mb-2"><input id="kBillingIgv" class="form-check-input" type="checkbox" checked><label class="form-check-label" for="kBillingIgv">Total incluye IGV 18%</label></div></div>
            <div class="col-12"><button id="kSaveBilling" class="btn btn-primary" type="button"><i class="bi bi-save me-2"></i>Guardar datos del recibo</button></div>
          </div>
        </div>
      </div>`;
    section.appendChild(wrapper);

    document.getElementById('kBrandLogoFile')?.addEventListener('change', async event => {
      const file = event.target.files?.[0] || null;
      state.logoFile = null;
      if (state.logoPreviewUrl) URL.revokeObjectURL(state.logoPreviewUrl);
      state.logoPreviewUrl = null;
      if (!file) return renderAppearance();
      try {
        const normalized = await normalizeImage(file);
        state.logoFile = normalized;
        state.logoPreviewUrl = URL.createObjectURL(normalized);
        renderAppearancePreview();
      } catch (error) {
        event.target.value = '';
        toast(error.message, 'danger');
      }
    });
    ['kBrandName', 'kBrandTagline', 'kBrandColor', 'kBrandEmoji', 'kBrandLogoUrl'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', renderAppearancePreview);
    });
    document.getElementById('kSaveAppearance')?.addEventListener('click', saveAppearance);
    document.getElementById('kRemoveLogo')?.addEventListener('click', removeLogo);
    document.getElementById('kSaveBilling')?.addEventListener('click', saveBilling);
  }

  function setValue(id, value) {
    const element = document.getElementById(id);
    if (element) element.value = value ?? '';
  }

  function renderAppearance() {
    createAppearanceUpgrade();
    const theme = state.theme || {};
    const billing = state.billing || {};
    setValue('kBrandName', theme.storeName || 'Kiosco');
    setValue('kBrandTagline', theme.storeTagline || 'Productos actualizados en tiempo real.');
    setValue('kBrandColor', theme.accentColor || '#f97316');
    setValue('kBrandEmoji', theme.storeEmoji || '🛍️');
    setValue('kBrandEta', theme.etaMinutes || 30);
    setValue('kBrandLogoUrl', theme.storeLogoUrl || '');
    setValue('kBillingName', billing.businessName || theme.storeName || 'Kiosco');
    setValue('kBillingRuc', billing.ruc || '');
    setValue('kBillingSeries', billing.series || 'B001');
    setValue('kBillingAddress', billing.address || '');
    setValue('kBillingPhone', billing.phone || '');
    setValue('kBillingEmail', billing.email || '');
    setValue('kBillingTitle', billing.documentTitle || 'RECIBO DE VENTA');
    setValue('kBillingNext', billing.nextNumber || 1);
    const igv = document.getElementById('kBillingIgv');
    if (igv) igv.checked = billing.includesIgv !== false;
    renderAppearancePreview();
  }

  function renderAppearancePreview() {
    const name = document.getElementById('kBrandName')?.value.trim() || 'Kiosco';
    const tagline = document.getElementById('kBrandTagline')?.value.trim() || 'Productos actualizados en tiempo real.';
    const emoji = document.getElementById('kBrandEmoji')?.value.trim() || '🛍️';
    const url = state.logoPreviewUrl || document.getElementById('kBrandLogoUrl')?.value.trim() || state.theme.storeLogoUrl;
    const color = document.getElementById('kBrandColor')?.value || '#f97316';
    document.getElementById('kBrandPreviewName').textContent = name;
    document.getElementById('kBrandPreviewTagline').textContent = tagline;
    const logo = document.getElementById('kBrandPreviewLogo');
    if (logo) logo.innerHTML = url ? `<img src="${html(url)}" alt="Vista previa">` : html(emoji);
    const button = document.getElementById('kBrandPreviewButton');
    if (button) button.style.background = color;
  }

  async function saveAppearance() {
    const button = document.getElementById('kSaveAppearance');
    const originalButtonHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Publicando';
    const previousPath = state.theme.storeLogoPath || null;
    let uploaded = null;
    try {
      if (state.logoFile) uploaded = await uploadLogo(state.logoFile);
      const typedUrl = document.getElementById('kBrandLogoUrl')?.value.trim() || '';
      const changes = {
        storeName: document.getElementById('kBrandName')?.value.trim() || 'Kiosco',
        storeTagline: document.getElementById('kBrandTagline')?.value.trim() || '',
        accentColor: document.getElementById('kBrandColor')?.value || '#f97316',
        storeEmoji: document.getElementById('kBrandEmoji')?.value.trim() || '🛍️',
        etaMinutes: Math.max(1, Number(document.getElementById('kBrandEta')?.value || 30)),
        storeLogoUrl: uploaded?.url || typedUrl || state.theme.storeLogoUrl || null,
        storeLogoPath: uploaded?.path || (typedUrl ? null : state.theme.storeLogoPath || null),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      await db.collection(COLL.config).doc('theme').set(changes, { merge: true });
      if ((uploaded || typedUrl) && previousPath && previousPath !== uploaded?.path) {
        await deleteStorageFile(previousPath);
      }
      state.logoFile = null;
      if (state.logoPreviewUrl) URL.revokeObjectURL(state.logoPreviewUrl);
      state.logoPreviewUrl = null;
      const fileInput = document.getElementById('kBrandLogoFile');
      if (fileInput) fileInput.value = '';
      applyLiveTheme({ ...state.theme, ...changes });
      toast(uploaded?.pendingDeploy ? 'Apariencia guardada. El nuevo logo se publicará al completar Firebase Hosting.' : 'Apariencia publicada en tiempo real', 'success');
    } catch (error) {
      if (uploaded?.path) await deleteStorageFile(uploaded.path);
      toast(error.message, 'danger');
    } finally {
      button.disabled = false;
    }
  }

  async function removeLogo() {
    if (!confirm('¿Quitar el logo actual?')) return;
    const previousPath = state.theme.storeLogoPath || null;
    try {
      await db.collection(COLL.config).doc('theme').set({
        storeLogoUrl: null,
        storeLogoPath: null,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      await deleteStorageFile(previousPath);
      toast('Logo eliminado', 'success');
    } catch (error) { toast(error.message, 'danger'); }
  }

  async function saveBilling() {
    const ruc = document.getElementById('kBillingRuc')?.value.replace(/\D/g, '') || '';
    if (ruc && ruc.length !== 11) return toast('El RUC debe tener 11 dígitos', 'danger');
    const data = {
      businessName: document.getElementById('kBillingName')?.value.trim() || state.theme.storeName || 'Kiosco',
      ruc,
      series: (document.getElementById('kBillingSeries')?.value || 'B001').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 10),
      address: document.getElementById('kBillingAddress')?.value.trim() || '',
      phone: document.getElementById('kBillingPhone')?.value.trim() || '',
      email: document.getElementById('kBillingEmail')?.value.trim() || '',
      documentTitle: document.getElementById('kBillingTitle')?.value.trim() || 'RECIBO DE VENTA',
      nextNumber: Math.max(1, Math.trunc(Number(document.getElementById('kBillingNext')?.value || 1))),
      includesIgv: document.getElementById('kBillingIgv')?.checked !== false,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    try {
      await db.collection(COLL.config).doc('billing').set(data, { merge: true });
      toast('Datos del recibo guardados', 'success');
    } catch (error) { toast(error.message, 'danger'); }
  }

  function openAdminSection(sectionName) {
    document.querySelectorAll('[data-admin-section]').forEach(element => element.classList.toggle('active', element.dataset.adminSection === sectionName));
    document.querySelectorAll('.admin-section').forEach(element => element.classList.toggle('active', element.id === `sec-${sectionName}`));
    if (sectionName === 'receipts') startAdminReceipts();
  }

  function createReceiptsSection() {
    if (document.getElementById('sec-receipts')) return;
    const appearanceLink = document.querySelector('.admin-sidebar [data-admin-section="apariencia"]');
    const link = document.createElement('a');
    link.href = '#';
    link.className = 'nav-link';
    link.dataset.adminSection = 'receipts';
    link.innerHTML = '<i class="bi bi-receipt-cutoff"></i> Recibos';
    appearanceLink?.parentElement?.insertBefore(link, appearanceLink);
    link.addEventListener('click', event => { event.preventDefault(); openAdminSection('receipts'); });

    const mobile = document.getElementById('adminNavMobile');
    if (mobile && !mobile.querySelector('[data-admin-section="receipts"]')) {
      const mobileLink = link.cloneNode(true);
      mobileLink.addEventListener('click', event => {
        event.preventDefault();
        bootstrap.Offcanvas.getInstance(document.getElementById('adminOffcanvas'))?.hide();
        openAdminSection('receipts');
      });
      mobile.appendChild(mobileLink);
    }

    const section = document.createElement('div');
    section.className = 'admin-section';
    section.id = 'sec-receipts';
    section.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3 gap-2 flex-wrap">
        <div><h2 class="section-title mb-1"><i class="bi bi-receipt-cutoff me-2"></i>Recibos</h2><p class="text-muted small mb-0">Emite, visualiza, imprime y comparte recibos con el cliente.</p></div>
        <div class="d-flex gap-2 flex-wrap align-items-center">
          <div class="btn-group btn-group-sm kiosk-receipt-filters" role="group" aria-label="Periodo de recibos">
            <button type="button" class="btn btn-outline-secondary active" data-receipt-period="today">Hoy</button>
            <button type="button" class="btn btn-outline-secondary" data-receipt-period="week">Semana</button>
            <button type="button" class="btn btn-outline-secondary" data-receipt-period="month">Mes</button>
          </div>
          <button id="kRefreshReceipts" class="btn btn-outline-secondary btn-sm"><i class="bi bi-arrow-clockwise me-1"></i>Actualizar</button>
        </div>
      </div>
      <div id="kReceiptPeriodSummary" class="text-muted small mb-2"></div>
      <div class="card"><div class="table-responsive"><table class="table table-hover align-middle mb-0">
        <thead><tr><th>Pedido</th><th>Cliente</th><th>Fecha</th><th>Total</th><th>Estado</th><th>Pago</th><th>Recibo</th><th>Acciones</th></tr></thead>
        <tbody id="kReceiptsBody"><tr><td colspan="8" class="text-center text-muted py-4">Cargando…</td></tr></tbody>
      </table></div></div>`;
    document.querySelector('.admin-content')?.appendChild(section);
    document.getElementById('kRefreshReceipts')?.addEventListener('click', startAdminReceipts);
    section.querySelectorAll('[data-receipt-period]').forEach(button => button.addEventListener('click', () => {
      state.receiptPeriod = button.dataset.receiptPeriod;
      section.querySelectorAll('[data-receipt-period]').forEach(item => item.classList.toggle('active', item === button));
      renderAdminReceipts(state.adminOrders);
    }));
  }

  function receiptStatus(order) {
    return order.billing?.publicToken
      ? `<span class="badge text-bg-success">Emitido ${html(order.billing.series || '')}-${String(order.billing.number || '').padStart(8, '0')}</span>`
      : '<span class="badge text-bg-secondary">Pendiente</span>';
  }

  function limaParts(date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
  }

  function periodMatches(order, period) {
    const date = order.createdAt?.toDate?.();
    if (!date) return false;
    const now = new Date();
    const current = limaParts(now);
    const value = limaParts(date);
    if (period === 'today') return value.year === current.year && value.month === current.month && value.day === current.day;
    if (period === 'month') return value.year === current.year && value.month === current.month;
    const todayUtc = Date.UTC(current.year, current.month - 1, current.day);
    const valueUtc = Date.UTC(value.year, value.month - 1, value.day);
    const weekday = new Date(todayUtc).getUTCDay() || 7;
    const monday = todayUtc - (weekday - 1) * 86400000;
    return valueUtc >= monday && valueUtc < monday + 7 * 86400000;
  }

  function statusLabel(value) {
    return ({ pending: 'Pendiente', preparing: 'En preparación', ready: 'Listo', done: 'Completado', rejected: 'Rechazado' })[value] || value || 'Pendiente';
  }

  async function openPaymentProof(orderId) {
    const proof = state.paymentProofs.get(orderId);
    if (!proof?.imageData) return toast('Este pedido no tiene imagen de pago', 'warning');
    const popup = window.open('', '_blank');
    if (!popup) return toast('El navegador bloqueó la ventana del comprobante', 'warning');
    popup.opener = null;
    popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pago ${html(orderId.slice(-8))}</title><style>body{font-family:system-ui;margin:0;background:#111827;color:#fff}header{padding:14px;display:flex;gap:8px;justify-content:flex-end}button,a{padding:10px 14px;border-radius:8px;border:0;text-decoration:none;background:#f97316;color:#fff;font-weight:700}main{display:grid;place-items:center;padding:10px}img{max-width:100%;max-height:calc(100vh - 90px);object-fit:contain;background:#fff}@media print{header{display:none}body{background:#fff}img{max-height:none}}</style></head><body><header><a href="${proof.imageData}" download="${html(proof.fileName || 'pago.jpg')}">Descargar</a><button onclick="window.print()">Imprimir</button></header><main><img src="${proof.imageData}" alt="Comprobante de pago"></main></body></html>`);
    popup.document.close();
  }

  function renderAdminReceipts(orders) {
    const body = document.getElementById('kReceiptsBody');
    if (!body) return;
    const filtered = orders.filter(order => periodMatches(order, state.receiptPeriod));
    const summary = document.getElementById('kReceiptPeriodSummary');
    if (summary) summary.textContent = `${filtered.length} pedido(s) en el periodo seleccionado`;
    if (!filtered.length) {
      body.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">No hay pedidos en este periodo.</td></tr>';
      return;
    }
    body.innerHTML = filtered.map(order => {
      const date = order.createdAt?.toDate?.()?.toLocaleString('es-PE', { timeZone: 'America/Lima' }) || '-';
      const url = publicReceiptUrl(order);
      const rejected = String(order.status || '').toLowerCase() === 'rejected';
      const proof = state.paymentProofs.get(order.id);
      const method = ({ cash: 'Efectivo', card: 'Tarjeta', yape: 'Yape', plin: 'Plin' })[order.paymentMethod] || order.paymentMethod || 'No indicado';
      return `<tr>
        <td><code>${html(order.id.slice(-8))}</code></td>
        <td>${html(order.customer || 'Cliente')}</td>
        <td>${html(date)}</td>
        <td class="fw-bold">S/ ${Number(order.total || 0).toFixed(2)}</td>
        <td>${html(statusLabel(order.status))}</td>
        <td><span class="small">${html(method)}</span>${proof ? '<div><span class="badge text-bg-info mt-1">Imagen adjunta</span></div>' : ''}</td>
        <td>${receiptStatus(order)}</td>
        <td><div class="d-flex gap-1 flex-wrap">
          ${url ? `<a class="btn btn-primary btn-sm" href="${html(url)}" data-open-receipt><i class="bi bi-eye me-1"></i>Ver</a>
            <a class="btn btn-outline-primary btn-sm" href="${html(publicReceiptUrl(order, true))}" data-open-receipt><i class="bi bi-printer me-1"></i>Imprimir</a>` : `<button class="btn btn-primary btn-sm" data-issue-receipt="${html(order.id)}" ${rejected ? 'disabled title="No se emite para pedidos rechazados"' : ''}><i class="bi bi-file-earmark-pdf me-1"></i>Emitir</button>`}
          ${proof ? `<button class="btn btn-outline-info btn-sm kiosk-proof-button" data-view-proof="${html(order.id)}"><i class="bi bi-image me-1"></i>Pago</button>` : ''}
          ${url ? `<button class="btn btn-outline-secondary btn-sm" data-copy-receipt="${html(url)}" title="Copiar enlace"><i class="bi bi-link-45deg"></i></button>` : ''}
        </div></td>
      </tr>`;
    }).join('');
    body.querySelectorAll('[data-open-receipt]').forEach(link => {
      link.addEventListener('click', rememberReceiptReturnUrl);
    });
    body.querySelectorAll('[data-issue-receipt]').forEach(button => button.addEventListener('click', () => issueReceipt(button.dataset.issueReceipt, button)));
    body.querySelectorAll('[data-view-proof]').forEach(button => button.addEventListener('click', () => openPaymentProof(button.dataset.viewProof)));
    body.querySelectorAll('[data-copy-receipt]').forEach(button => button.addEventListener('click', async () => {
      await navigator.clipboard.writeText(button.dataset.copyReceipt);
      toast('Enlace público copiado', 'success');
    }));
  }

  function startAdminReceipts() {
    if (!window.auth?.currentUser) return;
    state.receiptsUnsubscribe?.();
    state.proofsUnsubscribe?.();
    const body = document.getElementById('kReceiptsBody');
    if (body) body.innerHTML = '<tr><td colspan="8" class="text-center py-4"><span class="spinner-border spinner-border-sm"></span></td></tr>';
    state.receiptsUnsubscribe = db.collection(COLL.orders).onSnapshot(snapshot => {
      state.adminOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      renderAdminReceipts(state.adminOrders);
    }, error => {
      if (body) body.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-4">${html(error.message)}</td></tr>`;
    });
    state.proofsUnsubscribe = db.collection('paymentProofs').onSnapshot(snapshot => {
      state.paymentProofs = new Map(snapshot.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() }]));
      renderAdminReceipts(state.adminOrders);
    }, error => console.warn('Comprobantes de pago:', error));
  }

  function randomToken() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  }

  async function reserveReceiptClientSide(orderId) {
    const orderRef = db.collection(COLL.orders).doc(orderId);
    const configRef = db.collection(COLL.config).doc('billing');
    return db.runTransaction(async transaction => {
      const orderSnapshot = await transaction.get(orderRef);
      const configSnapshot = await transaction.get(configRef);
      if (!orderSnapshot.exists) throw new Error('Pedido no encontrado');
      const order = orderSnapshot.data() || {};
      if (String(order.status || '').toLowerCase() === 'rejected') throw new Error('No se puede emitir un recibo para un pedido rechazado');
      const existing = order.billing || {};
      if (existing.publicToken && existing.number) return { id: orderId, ...order };
      const config = configSnapshot.exists ? configSnapshot.data() : {};
      const series = String(config.series || 'B001').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 10) || 'B001';
      const number = Math.max(1, Math.trunc(Number(config.nextNumber || 1)));
      const billing = {
        ...existing,
        series,
        number,
        publicToken: existing.publicToken || randomToken(),
        public: true,
        issuedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      transaction.set(configRef, { nextNumber: number + 1, series, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      transaction.update(orderRef, { billing });
      return { id: orderId, ...order, billing };
    });
  }

  function openPdfBlob(blob, popup = null) {
    const url = URL.createObjectURL(blob);
    if (popup && !popup.closed) {
      popup.location.replace(url);
    } else {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.target = '_blank';
      anchor.rel = 'noopener';
      anchor.click();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 300000);
  }

  function prepareReceiptPopup() {
    const popup = window.open('', '_blank');
    if (!popup) return null;
    popup.opener = null;
    popup.document.write('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Generando recibo</title><style>body{font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0;background:#f8fafc;color:#111827}div{text-align:center}span{display:inline-block;width:34px;height:34px;border:4px solid #e5e7eb;border-top-color:#f97316;border-radius:50%;animation:s 1s linear infinite}@keyframes s{to{transform:rotate(360deg)}}</style></head><body><div><span></span><p>Generando recibo…</p></div></body></html>');
    popup.document.close();
    return popup;
  }

  async function issueReceipt(orderId, button) {
    const original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Generando';

    try {
      rememberReceiptReturnUrl();

      if (apiBaseUrl()) {
        const response = await adminApi('/api/boleta', { body: { orderId } });
        const blob = await response.blob();
        location.assign(URL.createObjectURL(blob));
        return;
      }

      const order = await reserveReceiptClientSide(orderId);
      const url = publicReceiptUrl(order);
      if (!url) throw new Error('No se pudo generar el enlace público del recibo');
      location.assign(url);
    } catch (error) {
      sessionStorage.removeItem(RECEIPT_RETURN_KEY);
      toast(error.message, 'danger');
      button.disabled = false;
      button.innerHTML = original;
    }
  }

  function receiptMoney(value) {
    return `S/ ${Number(value || 0).toFixed(2)}`;
  }

  async function renderPublicReceiptPage() {
    const params = new URLSearchParams(location.search);
    const orderId = params.get('receiptOrder') || '';
    const token = params.get('receiptToken') || '';
    if (!orderId || !token) return false;
    const [orderSnapshot, themeSnapshot, billingSnapshot] = await Promise.all([
      db.collection(COLL.orders).doc(orderId).get(),
      db.collection(COLL.config).doc('theme').get(),
      db.collection(COLL.config).doc('billing').get()
    ]);
    if (!orderSnapshot.exists) throw new Error('Recibo no encontrado');
    const order = { id: orderId, ...orderSnapshot.data() };
    if (order.billing?.public !== true || String(order.billing?.publicToken || '') !== token) throw new Error('Enlace de recibo inválido');
    const theme = themeSnapshot.exists ? themeSnapshot.data() : {};
    const billing = billingSnapshot.exists ? billingSnapshot.data() : {};
    const total = Number(order.total || 0);
    const subtotal = billing.includesIgv === false ? total : total / 1.18;
    const igv = billing.includesIgv === false ? 0 : total - subtotal;
    const issued = order.billing?.issuedAt?.toDate?.() || order.createdAt?.toDate?.() || new Date();
    const documentNumber = `${order.billing?.series || 'B001'}-${String(order.billing?.number || '').padStart(8, '0')}`;
    const logo = theme.storeLogoUrl ? `<img class="kiosk-print-logo" src="${html(theme.storeLogoUrl)}" alt="Logo">` : `<div class="kiosk-print-logo d-grid place-items-center" style="font-size:42px">${html(theme.storeEmoji || '🛍️')}</div>`;
    document.body.className = 'kiosk-print-receipt-page';
    document.body.innerHTML = `
      <div class="kiosk-print-toolbar"><button id="kReceiptBack" class="btn btn-outline-secondary" type="button">
  Volver
</button><button class="btn btn-primary" onclick="window.print()"><i class="bi bi-printer me-1"></i>Imprimir / guardar PDF</button></div>
      <main class="kiosk-print-sheet">
        <header class="kiosk-print-header">${logo}<div><h1 class="h4 mb-2">${html(billing.businessName || theme.storeName || 'Kiosco')}</h1><div>${html(billing.address || '')}</div><div>${html(billing.phone || '')}</div><div>${html(billing.email || '')}</div></div><div class="kiosk-print-box"><div>RUC ${html(billing.ruc || 'POR CONFIGURAR')}</div><div>${html(billing.documentTitle || 'RECIBO DE VENTA')}</div><div>${html(documentNumber)}</div></div></header>
        <section class="kiosk-print-meta"><strong>Fecha de emisión</strong><span>${html(issued.toLocaleString('es-PE', { timeZone: 'America/Lima' }))}</span><strong>Cliente</strong><span>${html(order.customer || 'Cliente')}</span><strong>Teléfono</strong><span>${html(order.customerPhone || '-')}</span><strong>Entrega</strong><span>${html(order.deliveryAddress || (order.deliveryType === 'delivery' ? 'Delivery' : 'Recojo en tienda'))}</span><strong>Método de pago</strong><span>${html(({ cash: 'Efectivo', card: 'Tarjeta', yape: 'Yape', plin: 'Plin' })[order.paymentMethod] || order.paymentMethod || 'No indicado')}</span></section>
        <table class="kiosk-print-table"><thead><tr><th>Cant.</th><th>Unidad</th><th>Descripción</th><th>P. Unit.</th><th>Total</th></tr></thead><tbody>${(order.items || []).map(item => `<tr><td>${Number(item.qty || 0)}</td><td>${html(item.unit || 'UND')}</td><td>${html(item.name || 'Producto')}</td><td>${receiptMoney(item.price)}</td><td>${receiptMoney(item.subtotal ?? Number(item.price || 0) * Number(item.qty || 0))}</td></tr>`).join('')}</tbody></table>
        <div class="kiosk-print-totals"><div class="kiosk-print-total-row"><span>Op. gravadas</span><strong>${receiptMoney(subtotal)}</strong></div><div class="kiosk-print-total-row"><span>IGV 18%</span><strong>${receiptMoney(igv)}</strong></div><div class="kiosk-print-total-row kiosk-print-grand"><span>Total</span><span>${receiptMoney(total)}</span></div></div>
        <footer class="kiosk-print-footer">Representación impresa informativa. No sustituye un comprobante electrónico autorizado por SUNAT.<br>Pedido ${html(orderId)}</footer>
      </main>`;
    document.getElementById('kReceiptBack')?.addEventListener('click', returnFromReceipt);
    if (params.get('print') === '1') window.setTimeout(() => window.print(), 600);
    return true;
  }

  function clientIdentity() {
    try {
      return {
        name: window.Auth?.getClientName?.().trim() || localStorage.getItem('kk_name')?.trim() || '',
        phone: window.Auth?.getClientPhone?.().trim() || localStorage.getItem('kk_phone')?.trim() || ''
      };
    } catch { return { name: '', phone: '' }; }
  }

  function createPublicReceiptsPanel() {
    if (document.getElementById('kPublicReceipts')) return;
    const profileList = document.getElementById('profileOrdersList');
    if (profileList) {
      const panel = document.createElement('div');
      panel.id = 'kPublicReceipts';
      panel.className = 'mt-3';
      panel.innerHTML = '<div class="text-muted small">Cargando recibos…</div>';
      profileList.insertAdjacentElement('afterend', panel);
    }
  }

  function renderPublicReceipts(orders) {
    createPublicReceiptsPanel();
    const panel = document.getElementById('kPublicReceipts');
    if (!panel) return;
    const emitted = orders.filter(order => publicReceiptUrl(order));
    const pending = orders.filter(order => !publicReceiptUrl(order));
    panel.innerHTML = `
      <h6 class="fw-bold mb-2"><i class="bi bi-receipt me-2"></i>Mis recibos</h6>
      ${emitted.length ? emitted.map(order => {
        const url = publicReceiptUrl(order);
        return `<a class="kiosk-public-receipt" href="${html(url)}" data-open-receipt>
          <span><strong>Pedido ${html(order.id.slice(-8))}</strong><small>${html(order.billing.series || '')}-${String(order.billing.number || '').padStart(8, '0')}</small></span>
          <span><i class="bi bi-printer me-1"></i>Ver / imprimir</span>
        </a>`;
      }).join('') : '<div class="text-muted small">Todavía no tienes recibos emitidos.</div>'}
      ${pending.length ? `<div class="alert alert-secondary py-2 mt-2 mb-0 small">${pending.length} pedido(s) todavía pendientes de emisión.</div>` : ''}`;
    panel.querySelectorAll('[data-open-receipt]').forEach(link => {
      link.addEventListener('click', rememberReceiptReturnUrl);
    });
  }

  function startPublicReceipts() {
    createPublicReceiptsPanel();
    state.publicUnsubscribe?.();
    const identity = clientIdentity();
    if (!identity.name) return renderPublicReceipts([]);
    let query = db.collection(COLL.orders).where('customer', '==', identity.name);
    if (identity.phone) query = query.where('customerPhone', '==', identity.phone);
    state.publicUnsubscribe = query.limit(30).onSnapshot(snapshot => {
      const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      renderPublicReceipts(orders);
    }, error => console.warn('Recibos públicos:', error));
  }

  function subscribeConfiguration() {
    db.collection(COLL.config).doc('theme').onSnapshot(snapshot => {
      state.theme = snapshot.exists ? snapshot.data() : {};
      applyLiveTheme(state.theme);
      renderAppearance();
    }, error => console.warn('Theme:', error));
    db.collection(COLL.config).doc('billing').onSnapshot(snapshot => {
      state.billing = snapshot.exists ? snapshot.data() : {};
      renderAppearance();
    }, error => console.warn('Billing:', error));
  }

  function bindIdentityChanges() {
    document.getElementById('clientLoginForm')?.addEventListener('submit', () => setTimeout(startPublicReceipts, 200));
    document.getElementById('saveProfileBtn')?.addEventListener('click', () => setTimeout(startPublicReceipts, 200));
    document.getElementById('logoutClientBtn')?.addEventListener('click', () => setTimeout(startPublicReceipts, 200));
  }

  async function init() {
    if (!window.db || !window.firebase) return;
    try {
      if (await renderPublicReceiptPage()) return;
    } catch (error) {
      document.body.innerHTML = `<div class="container py-5"><div class="alert alert-danger">${html(error.message)}</div></div>`;
      return;
    }
    createAppearanceUpgrade();
    createReceiptsSection();
    createPublicReceiptsPanel();
    subscribeConfiguration();
    bindIdentityChanges();
    startPublicReceipts();
    auth?.onAuthStateChanged?.(user => {
      if (user && document.getElementById('sec-receipts')?.classList.contains('active')) startAdminReceipts();
    });
    window.KioscoReceiptsAppearance = Object.freeze({
      refreshPublicReceipts: startPublicReceipts,
      refreshAdminReceipts: startAdminReceipts
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 100), { once: true });
  else setTimeout(init, 100);
})();

// ===== Funcionalidad integrada: final improvements =====
'use strict';

(() => {
  const MAX_PROOF_SOURCE_SIZE = 10 * 1024 * 1024;
  const MAX_PROOF_DATA_LENGTH = 420000;
  const state = {
    quickType: 'category',
    quickParentId: '',
    proof: null,
    checkoutExtras: null
  };

  function toast(message, type = 'info') {
    if (typeof window.showToast === 'function') window.showToast(message, type);
    else console.info(`[Kiosco:${type}]`, message);
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

  function ensureQuickCategoryModal() {
    if (document.getElementById('kQuickCategoryModal')) return;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="modal fade" id="kQuickCategoryModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header border-0">
              <h5 class="modal-title fw-bold" id="kQuickCategoryTitle">Nueva categoría</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
            </div>
            <div class="modal-body">
              <form id="kQuickCategoryForm">
                <div class="mb-3">
                  <label class="form-label fw-semibold">Nombre <span class="text-danger">*</span></label>
                  <input id="kQuickCategoryName" class="form-control" maxlength="60" required autocomplete="off">
                </div>
                <div class="mb-3">
                  <label class="form-label fw-semibold">Emoji</label>
                  <input id="kQuickCategoryEmoji" class="form-control" maxlength="8" placeholder="📦">
                </div>
                <div id="kQuickCategoryParentInfo" class="alert alert-secondary py-2 small" hidden></div>
                <div class="d-flex justify-content-end gap-2">
                  <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
                  <button type="submit" class="btn btn-primary"><i class="bi bi-plus-circle me-2"></i>Crear</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrapper.firstElementChild);
    document.getElementById('kQuickCategoryForm')?.addEventListener('submit', saveQuickCategory);
  }

  function reopenProductModal() {
    const modalElement = document.getElementById('productModal');
    if (!modalElement || typeof bootstrap === 'undefined') return;
    window.setTimeout(() => bootstrap.Modal.getOrCreateInstance(modalElement).show(), 120);
  }

  function openQuickCategory(type) {
    ensureQuickCategoryModal();
    const parentSelect = document.getElementById('productCategory');
    const parentId = parentSelect?.value || '';
    if (type === 'subcategory' && !parentId) {
      toast('Selecciona primero una categoría principal', 'warning');
      parentSelect?.focus();
      return;
    }

    state.quickType = type;
    state.quickParentId = type === 'subcategory' ? parentId : '';
    const title = document.getElementById('kQuickCategoryTitle');
    const name = document.getElementById('kQuickCategoryName');
    const emoji = document.getElementById('kQuickCategoryEmoji');
    const info = document.getElementById('kQuickCategoryParentInfo');
    if (title) title.textContent = type === 'subcategory' ? 'Nueva subcategoría' : 'Nueva categoría';
    if (name) name.value = '';
    if (emoji) emoji.value = '';
    if (info) {
      info.hidden = type !== 'subcategory';
      info.textContent = type === 'subcategory'
        ? `Se agregará dentro de: ${parentSelect?.selectedOptions?.[0]?.textContent || 'categoría seleccionada'}`
        : '';
    }

    const productModal = document.getElementById('productModal');
    bootstrap.Modal.getInstance(productModal)?.hide();
    const quickElement = document.getElementById('kQuickCategoryModal');
    quickElement.dataset.reopenProduct = 'true';
    quickElement.addEventListener('hidden.bs.modal', () => {
      if (quickElement.dataset.reopenProduct === 'true') reopenProductModal();
      delete quickElement.dataset.reopenProduct;
    }, { once: true });
    const quickModal = bootstrap.Modal.getOrCreateInstance(quickElement);
    quickModal.show();
    window.setTimeout(() => name?.focus(), 180);
  }

  async function waitForOption(selectId, optionValue, attempts = 30) {
    const select = document.getElementById(selectId);
    if (!select) return false;
    for (let index = 0; index < attempts; index += 1) {
      if ([...select.options].some(option => option.value === optionValue)) {
        select.value = optionValue;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      await new Promise(resolve => window.setTimeout(resolve, 100));
    }
    return false;
  }

  async function saveQuickCategory(event) {
    event.preventDefault();
    const name = document.getElementById('kQuickCategoryName')?.value.trim() || '';
    const emoji = document.getElementById('kQuickCategoryEmoji')?.value.trim() || null;
    const submit = event.submitter;
    if (!name) return toast('El nombre es obligatorio', 'warning');
    if (!window.db || !window.COLL) return toast('Firestore no está disponible', 'danger');

    if (submit) {
      submit.disabled = true;
      submit.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Creando';
    }
    try {
      const reference = await db.collection(COLL.categories).add({
        name,
        emoji,
        parentId: state.quickType === 'subcategory' ? state.quickParentId : null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      bootstrap.Modal.getInstance(document.getElementById('kQuickCategoryModal'))?.hide();
      const targetSelect = state.quickType === 'subcategory' ? 'productSubcat' : 'productCategory';
      await waitForOption(targetSelect, reference.id);
      toast(state.quickType === 'subcategory' ? 'Subcategoría creada' : 'Categoría creada', 'success');
    } catch (error) {
      toast(`No se pudo crear: ${error.message}`, 'danger');
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.innerHTML = '<i class="bi bi-plus-circle me-2"></i>Crear';
      }
    }
  }

  function wrapSelectWithAddButton(selectId, buttonId, label, type) {
    const select = document.getElementById(selectId);
    if (!select || document.getElementById(buttonId)) return;
    const group = document.createElement('div');
    group.className = 'input-group kiosk-category-input-group';
    select.parentNode.insertBefore(group, select);
    group.appendChild(select);
    const button = document.createElement('button');
    button.id = buttonId;
    button.type = 'button';
    button.className = 'btn btn-outline-primary';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = '<i class="bi bi-plus-lg"></i>';
    button.addEventListener('click', () => openQuickCategory(type));
    group.appendChild(button);
  }

  function installCategoryButtons() {
    wrapSelectWithAddButton('productCategory', 'kAddCategoryInline', 'Agregar categoría', 'category');
    wrapSelectWithAddButton('productSubcat', 'kAddSubcategoryInline', 'Agregar subcategoría', 'subcategory');
  }

  function paymentMethod() {
    const kind = document.querySelector('input[name="kPaymentKind"]:checked')?.value || 'cash';
    if (kind === 'wallet') return document.getElementById('kWalletType')?.value || 'yape';
    return kind;
  }

  function paymentGroup(method = paymentMethod()) {
    if (['yape', 'plin'].includes(method)) return 'wallet';
    return method === 'card' ? 'card' : 'cash';
  }

  function updatePaymentUi() {
    const kind = document.querySelector('input[name="kPaymentKind"]:checked')?.value || 'cash';
    const wallet = document.getElementById('kWalletRow');
    const proof = document.getElementById('kPaymentProofRow');
    const required = document.getElementById('kPaymentProofRequired');
    if (wallet) wallet.hidden = kind !== 'wallet';
    if (proof) proof.hidden = kind === 'cash';
    if (required) required.hidden = kind === 'cash';
  }

  function resetProof() {
    state.proof = null;
    const input = document.getElementById('kPaymentProofFile');
    const preview = document.getElementById('kPaymentProofPreview');
    const info = document.getElementById('kPaymentProofInfo');
    if (input) input.value = '';
    if (preview) {
      preview.removeAttribute('src');
      preview.hidden = true;
    }
    if (info) info.textContent = 'JPG, PNG o WEBP. La imagen se comprime antes de enviarse.';
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('El formato no puede procesarse en este navegador'));
      image.src = url;
    });
  }

  async function compressPaymentProof(file) {
    if (!file || file.size === 0) throw new Error('Selecciona una imagen válida');
    if (file.size > MAX_PROOF_SOURCE_SIZE) throw new Error('La imagen no debe superar 10 MB');
    if (file.type && !file.type.startsWith('image/')) throw new Error('El comprobante debe ser una imagen');

    const originalUrl = URL.createObjectURL(file);
    try {
      const image = await loadImage(originalUrl);
      const maxDimension = 1280;
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
      canvas.height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
      const context = canvas.getContext('2d', { alpha: false });
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      let quality = 0.78;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      while (dataUrl.length > MAX_PROOF_DATA_LENGTH && quality > 0.42) {
        quality -= 0.08;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
      }
      if (dataUrl.length > MAX_PROOF_DATA_LENGTH) {
        throw new Error('La imagen continúa siendo demasiado pesada. Recórtala o toma una captura más pequeña.');
      }
      return {
        imageData: dataUrl,
        fileName: String(file.name || 'comprobante.jpg').slice(0, 120),
        contentType: 'image/jpeg',
        originalType: String(file.type || '').slice(0, 80),
        encodedLength: dataUrl.length
      };
    } finally {
      URL.revokeObjectURL(originalUrl);
    }
  }

  async function handleProofSelection(event) {
    const file = event.target.files?.[0] || null;
    resetProof();
    if (!file) return;
    const info = document.getElementById('kPaymentProofInfo');
    if (info) info.textContent = 'Procesando imagen…';
    try {
      state.proof = await compressPaymentProof(file);
      const preview = document.getElementById('kPaymentProofPreview');
      if (preview) {
        preview.src = state.proof.imageData;
        preview.hidden = false;
      }
      if (info) info.textContent = `${file.name} · comprobante listo para enviar`;
    } catch (error) {
      event.target.value = '';
      if (info) info.textContent = error.message;
      toast(error.message, 'danger');
    }
  }

  function ensurePaymentUi() {
    const notes = document.getElementById('orderNotes');
    if (!notes) return;
    notes.maxLength = 300;

    let wrapper = document.getElementById('kioskPaymentSelector');
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.id = 'kioskPaymentSelector';
      wrapper.className = 'mb-3';
      notes.closest('.mb-3')?.parentElement?.insertBefore(wrapper, notes.closest('.mb-3'));
    }
    if (wrapper.dataset.finalUi === 'true') return;
    wrapper.dataset.finalUi = 'true';
    wrapper.innerHTML = `
      <label class="form-label fw-semibold">Método de pago <span class="text-danger">*</span></label>
      <div class="row g-2 mb-2">
        <div class="col-12 col-sm-4"><label class="kiosk-payment-option d-flex align-items-center gap-2 h-100"><input class="form-check-input mt-0" type="radio" name="kPaymentKind" value="cash" checked><span>💵 Efectivo</span></label></div>
        <div class="col-12 col-sm-4"><label class="kiosk-payment-option d-flex align-items-center gap-2 h-100"><input class="form-check-input mt-0" type="radio" name="kPaymentKind" value="card"><span>💳 Tarjeta</span></label></div>
        <div class="col-12 col-sm-4"><label class="kiosk-payment-option d-flex align-items-center gap-2 h-100"><input class="form-check-input mt-0" type="radio" name="kPaymentKind" value="wallet"><span>📱 Billetera digital</span></label></div>
      </div>
      <div id="kWalletRow" class="mb-2" hidden>
        <label class="form-label small fw-semibold">Billetera</label>
        <select id="kWalletType" class="form-select"><option value="yape">Yape</option><option value="plin">Plin</option></select>
      </div>
      <div id="kPaymentProofRow" class="mb-2" hidden>
        <label class="form-label small fw-semibold">Imagen del pago <span id="kPaymentProofRequired" class="text-danger">*</span></label>
        <input id="kPaymentProofFile" type="file" class="form-control" accept="image/*,.heic,.heif">
        <div id="kPaymentProofInfo" class="form-text">JPG, PNG o WEBP. La imagen se comprime antes de enviarse.</div>
        <img id="kPaymentProofPreview" class="kiosk-payment-proof-preview mt-2" alt="Vista previa del pago" hidden>
      </div>`;
    wrapper.addEventListener('change', event => {
      if (!event.target.matches('input[name="kPaymentKind"], #kWalletType')) return;
      if (event.target.matches('input[name="kPaymentKind"][value="cash"]')) resetProof();
      updatePaymentUi();
    });
    document.getElementById('kPaymentProofFile')?.addEventListener('change', handleProofSelection);

    const notesGroup = notes.closest('.mb-3') || notes.parentElement;
    let counter = document.getElementById('kOrderNotesCounter');
    if (!counter) {
      counter = document.createElement('div');
      counter.id = 'kOrderNotesCounter';
      counter.className = 'form-text text-end';
      notesGroup?.appendChild(counter);
    }
    const updateCounter = () => { counter.textContent = `${notes.value.length}/300`; };
    notes.addEventListener('input', updateCounter);
    updateCounter();

    document.getElementById('orderModal')?.addEventListener('show.bs.modal', () => {
      const cash = document.querySelector('input[name="kPaymentKind"][value="cash"]');
      if (cash) cash.checked = true;
      resetProof();
      updatePaymentUi();
      updateCounter();
    });
    updatePaymentUi();
  }

  function getCheckoutExtras() {
    if (state.checkoutExtras) return state.checkoutExtras;
    const method = paymentMethod();
    return {
      paymentMethod: method,
      paymentGroup: paymentGroup(method),
      paymentProofExpected: Boolean(state.proof)
    };
  }

  async function savePaymentProof(orderId, method, proof) {
    if (!proof) return;
    await db.collection('paymentProofs').doc(orderId).set({
      orderId,
      paymentMethod: method,
      imageData: proof.imageData,
      fileName: proof.fileName,
      contentType: proof.contentType,
      originalType: proof.originalType || null,
      encodedLength: proof.encodedLength,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  function installCheckoutWrapper() {
    if (!window.Cart || Cart.checkout?.__kioskFinalWrapper) return;
    const originalCheckout = Cart.checkout.bind(Cart);
    const wrapped = async function checkoutWithProof(...args) {
      const method = paymentMethod();
      const group = paymentGroup(method);
      if (group !== 'cash' && !state.proof) {
        throw new Error('Adjunta la imagen del pago para Tarjeta o Billetera digital.');
      }
      const proof = group === 'cash' ? null : state.proof;
      state.checkoutExtras = {
        paymentMethod: method,
        paymentGroup: group,
        paymentProofExpected: Boolean(proof)
      };
      try {
        const orderId = await originalCheckout(...args);
        if (proof) {
          try {
            await savePaymentProof(orderId, method, proof);
          } catch (error) {
            console.warn('Comprobante de pago:', error);
            toast('El pedido se registró, pero la imagen del pago no pudo guardarse. Comunícate con la tienda.', 'warning');
          }
        }
        resetProof();
        return orderId;
      } finally {
        state.checkoutExtras = null;
      }
    };
    wrapped.__kioskFinalWrapper = true;
    Cart.checkout = wrapped;
  }

  function init() {
    ensureQuickCategoryModal();
    installCategoryButtons();
    ensurePaymentUi();
    window.setTimeout(installCheckoutWrapper, 900);
    document.getElementById('productModal')?.addEventListener('shown.bs.modal', installCategoryButtons);
    window.KioscoFinalImprovements = Object.freeze({
      getCheckoutExtras,
      refreshCategoryControls: installCategoryButtons
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.setTimeout(init, 200), { once: true });
  } else {
    window.setTimeout(init, 200);
  }
})();

// ===== Funcionalidad integrada: audit =====
/* KIOSCO_AUDIT: registro inmutable de acciones administrativas y exportación PDF */
(function initializeKioscoAudit() {
  'use strict';

  const AUDIT_COLLECTION = 'audit_log';
  const MAX_VISIBLE_LOGS = 1000;
  const SESSION_LOGIN_KEY = 'kk_audit_login_recorded';
  const state = {
    initialized: false,
    firestorePatched: false,
    period: 'day',
    logs: [],
    unsubscribe: null,
    staff: [],
    staffLoadedAt: 0,
    originals: null
  };

  const entityLabels = {
    products: 'Productos',
    categories: 'Categorías',
    orders: 'Pedidos',
    receipts: 'Recibos',
    paymentProofs: 'Comprobantes de pago',
    config: 'Configuración',
    chats: 'Chat'
  };

  const actionLabels = {
    create: 'Creación',
    set: 'Guardado',
    update: 'Actualización',
    delete: 'Eliminación',
    login: 'Inicio de sesión',
    logout: 'Cierre de sesión'
  };

  function esc(value) {
    if (typeof window.esc === 'function') return window.esc(value);
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function toast(message, type = 'info') {
    if (typeof window.showToast === 'function') window.showToast(message, type);
    else console[type === 'danger' ? 'error' : 'log'](message);
  }

  function isAdminSession() {
    return Boolean(window.auth?.currentUser && localStorage.getItem('kk_role') === 'admin');
  }

  function moduleFromPath(path) {
    const [collection, documentId] = String(path || '').split('/');
    if (collection === 'config') {
      const configLabels = {
        staff: 'Personal',
        theme: 'Apariencia',
        settings: 'Horario y configuración',
        payments: 'Métodos de pago',
        billing: 'Facturación',
        admin: 'Administradores'
      };
      return configLabels[documentId] || 'Configuración';
    }
    return entityLabels[collection] || collection || 'Sistema';
  }

  function entityIdFromPath(path) {
    const parts = String(path || '').split('/');
    return parts.length > 1 ? parts[parts.length - 1] : null;
  }

  function safeValue(value, maxLength = 100) {
    if (value == null) return '';
    if (typeof value === 'string') return value.slice(0, maxLength);
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return '';
  }

  function describeMutation(path, data, action) {
    const [collection, documentId] = String(path || '').split('/');
    const source = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    const details = [];

    if (collection === 'products') {
      const name = safeValue(source.name);
      if (name) details.push(name);
      if (source.stock != null) details.push(`stock ${safeValue(source.stock)}`);
      if (source.price != null) details.push(`precio S/ ${Number(source.price || 0).toFixed(2)}`);
    } else if (collection === 'categories') {
      const name = safeValue(source.name);
      if (name) details.push(name);
      if (source.parentId) details.push('subcategoría');
    } else if (collection === 'orders') {
      if (source.status) details.push(`estado ${safeValue(source.status)}`);
      if (source.total != null) details.push(`total S/ ${Number(source.total || 0).toFixed(2)}`);
      if (source.customer) details.push(`cliente ${safeValue(source.customer, 60)}`);
    } else if (collection === 'receipts') {
      if (source.receiptNumber) details.push(safeValue(source.receiptNumber));
      if (source.orderId) details.push(`pedido ${safeValue(source.orderId, 40)}`);
    } else if (collection === 'paymentProofs') {
      details.push(`pedido ${safeValue(documentId, 40)}`);
      if (source.paymentMethod) details.push(safeValue(source.paymentMethod));
    } else if (collection === 'config') {
      if (documentId === 'staff') details.push('lista de personal');
      else if (documentId === 'theme') details.push('identidad visual');
      else if (documentId === 'settings') details.push('horario/configuración');
      else if (documentId === 'payments') details.push('cuentas de pago');
      else if (documentId === 'billing') details.push('datos de facturación');
      else details.push(safeValue(documentId, 60));
    }

    const label = moduleFromPath(path);
    const verb = actionLabels[action] || action;
    return `${verb} en ${label}${details.length ? `: ${details.join(' · ')}` : ''}`.slice(0, 420);
  }

  async function loadStaff() {
    const now = Date.now();
    if (state.staffLoadedAt && now - state.staffLoadedAt < 5 * 60 * 1000) return state.staff;
    try {
      const snapshot = await window.db.collection(window.COLL?.config || 'config').doc('staff').get();
      state.staff = snapshot.exists && Array.isArray(snapshot.data()?.members)
        ? snapshot.data().members
        : [];
    } catch (error) {
      console.warn('Auditoría: no se pudo cargar personal:', error?.message || error);
      state.staff = [];
    }
    state.staffLoadedAt = now;
    return state.staff;
  }

  async function resolveIdentity(user = window.auth?.currentUser) {
    const phone = user?.phoneNumber || '';
    const staff = await loadStaff();
    const member = staff.find(item => String(item?.phone || '') === phone);
    return {
      uid: user?.uid || null,
      phone: phone || null,
      name: safeValue(member?.name || user?.displayName || 'Administrador', 100),
      role: safeValue(member?.role || 'admin', 40)
    };
  }

  async function writeAudit({ action, path = '', data = null, description = '', identity = null }) {
    if (!window.db || !window.auth?.currentUser) return;
    const module = moduleFromPath(path);
    const actor = identity || await resolveIdentity();
    const payload = {
      action,
      actionLabel: actionLabels[action] || action,
      module,
      entityPath: path || null,
      entityId: entityIdFromPath(path),
      description: description || describeMutation(path, data, action),
      actor,
      createdAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      clientCreatedAt: new Date().toISOString(),
      userAgent: String(navigator.userAgent || '').slice(0, 300)
    };

    try {
      const collection = window.db.collection(AUDIT_COLLECTION);
      await state.originals.collectionAdd.call(collection, payload);
    } catch (error) {
      console.warn('Auditoría: no se pudo guardar el evento:', error?.message || error);
    }
  }

  function shouldAuditPath(path) {
    if (!isAdminSession()) return false;
    const collection = String(path || '').split('/')[0];
    return Boolean(collection && ![AUDIT_COLLECTION, '__audit_probe__'].includes(collection));
  }

  function normalizeUpdateData(args) {
    if (args.length === 1 && args[0] && typeof args[0] === 'object') return args[0];
    const result = {};
    for (let index = 0; index < args.length; index += 2) {
      const field = args[index];
      if (typeof field === 'string') result[field] = args[index + 1];
    }
    return result;
  }

  function patchFirestoreWrites() {
    if (state.firestorePatched || !window.db) return;
    const sampleCollection = window.db.collection('__audit_probe__');
    const sampleDocument = sampleCollection.doc('__probe__');
    const collectionPrototype = Object.getPrototypeOf(sampleCollection);
    const documentPrototype = Object.getPrototypeOf(sampleDocument);

    const originals = {
      collectionAdd: collectionPrototype.add,
      documentSet: documentPrototype.set,
      documentUpdate: documentPrototype.update,
      documentDelete: documentPrototype.delete,
      runTransaction: window.db.runTransaction.bind(window.db),
      batch: window.db.batch.bind(window.db)
    };
    state.originals = originals;

    collectionPrototype.add = async function auditedAdd(data) {
      const result = await originals.collectionAdd.call(this, data);
      if (shouldAuditPath(this.path)) {
        void writeAudit({ action: 'create', path: `${this.path}/${result.id}`, data });
      }
      return result;
    };

    documentPrototype.set = async function auditedSet(data, options) {
      const result = options === undefined
        ? await originals.documentSet.call(this, data)
        : await originals.documentSet.call(this, data, options);
      if (shouldAuditPath(this.path)) void writeAudit({ action: 'set', path: this.path, data });
      return result;
    };

    documentPrototype.update = async function auditedUpdate(...args) {
      const result = await originals.documentUpdate.apply(this, args);
      if (shouldAuditPath(this.path)) {
        void writeAudit({ action: 'update', path: this.path, data: normalizeUpdateData(args) });
      }
      return result;
    };

    documentPrototype.delete = async function auditedDelete() {
      const path = this.path;
      const result = await originals.documentDelete.call(this);
      if (shouldAuditPath(path)) void writeAudit({ action: 'delete', path });
      return result;
    };

    window.db.runTransaction = function auditedTransaction(updateFunction, options) {
      const actions = [];
      const wrappedUpdate = transaction => {
        const proxy = new Proxy(transaction, {
          get(target, property) {
            if (property === 'set') return (reference, data, setOptions) => {
              actions.push({ action: 'set', path: reference.path, data });
              target.set(reference, data, setOptions);
              return proxy;
            };
            if (property === 'update') return (reference, ...args) => {
              actions.push({ action: 'update', path: reference.path, data: normalizeUpdateData(args) });
              target.update(reference, ...args);
              return proxy;
            };
            if (property === 'delete') return reference => {
              actions.push({ action: 'delete', path: reference.path, data: null });
              target.delete(reference);
              return proxy;
            };
            const value = target[property];
            return typeof value === 'function' ? value.bind(target) : value;
          }
        });
        return updateFunction(proxy);
      };
      return originals.runTransaction(wrappedUpdate, options).then(result => {
        actions.filter(item => shouldAuditPath(item.path)).forEach(item => void writeAudit(item));
        return result;
      });
    };

    window.db.batch = function auditedBatch() {
      const batch = originals.batch();
      const actions = [];
      const proxy = new Proxy(batch, {
        get(target, property) {
          if (property === 'set') return (reference, data, options) => {
            actions.push({ action: 'set', path: reference.path, data });
            target.set(reference, data, options);
            return proxy;
          };
          if (property === 'update') return (reference, ...args) => {
            actions.push({ action: 'update', path: reference.path, data: normalizeUpdateData(args) });
            target.update(reference, ...args);
            return proxy;
          };
          if (property === 'delete') return reference => {
            actions.push({ action: 'delete', path: reference.path, data: null });
            target.delete(reference);
            return proxy;
          };
          if (property === 'commit') return async () => {
            const result = await target.commit();
            actions.filter(item => shouldAuditPath(item.path)).forEach(item => void writeAudit(item));
            return result;
          };
          const value = target[property];
          return typeof value === 'function' ? value.bind(target) : value;
        }
      });
      return proxy;
    };

    state.firestorePatched = true;
  }

  function periodStart(period, now = new Date()) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    if (period === 'week') {
      const day = start.getDay();
      const diff = day === 0 ? 6 : day - 1;
      start.setDate(start.getDate() - diff);
    } else if (period === 'month') {
      start.setDate(1);
    }
    return start;
  }

  function logDate(log) {
    if (log.createdAt?.toDate) return log.createdAt.toDate();
    if (log.clientCreatedAt) return new Date(log.clientCreatedAt);
    return new Date(0);
  }

  function filteredLogs() {
    const start = periodStart(state.period);
    return state.logs.filter(log => logDate(log) >= start);
  }

  function formatDate(date) {
    return date.toLocaleString('es-PE', {
      timeZone: 'America/Lima',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }

  function badgeClass(action) {
    return {
      create: 'success', set: 'primary', update: 'warning', delete: 'danger',
      login: 'info', logout: 'secondary'
    }[action] || 'secondary';
  }

  function render() {
    const body = document.getElementById('auditTableBody');
    if (!body) return;
    const logs = filteredLogs();
    document.getElementById('auditTotalCount').textContent = String(logs.length);
    document.getElementById('auditPeopleCount').textContent = String(new Set(logs.map(log => log.actor?.phone || log.actor?.uid || log.actor?.name).filter(Boolean)).size);
    document.getElementById('auditModuleCount').textContent = String(new Set(logs.map(log => log.module).filter(Boolean)).size);

    document.querySelectorAll('[data-audit-period]').forEach(button => {
      const active = button.dataset.auditPeriod === state.period;
      button.classList.toggle('btn-primary', active);
      button.classList.toggle('btn-outline-secondary', !active);
      button.classList.toggle('active', active);
    });

    if (!logs.length) {
      body.innerHTML = '<tr><td colspan="6"><div class="audit-empty d-flex flex-column align-items-center justify-content-center text-muted"><i class="bi bi-shield-check display-5 mb-2"></i><p class="mb-0">No existen registros en este período.</p></div></td></tr>';
      return;
    }

    body.innerHTML = logs.map(log => {
      const actor = log.actor || {};
      return `<tr>
        <td class="text-nowrap">${esc(formatDate(logDate(log)))}</td>
        <td class="audit-person"><strong>${esc(actor.name || 'Administrador')}</strong><br><small class="text-muted">${esc(actor.phone || actor.role || '')}</small></td>
        <td><span class="badge text-bg-${badgeClass(log.action)}">${esc(log.actionLabel || actionLabels[log.action] || log.action || 'Acción')}</span></td>
        <td>${esc(log.module || 'Sistema')}</td>
        <td class="audit-detail">${esc(log.description || '')}</td>
        <td class="font-monospace small">${esc(log.entityId || '—')}</td>
      </tr>`;
    }).join('');
  }

  function setPeriod(period) {
    state.period = ['day', 'week', 'month'].includes(period) ? period : 'day';
    render();
  }

  function subscribe() {
    if (state.unsubscribe || !window.db) return;
    state.unsubscribe = window.db.collection(AUDIT_COLLECTION)
      .orderBy('createdAt', 'desc')
      .limit(MAX_VISIBLE_LOGS)
      .onSnapshot(snapshot => {
        state.logs = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
        render();
      }, error => {
        console.error('Auditoría:', error);
        toast(error?.code === 'permission-denied'
          ? 'Sin permiso para leer Auditoría. Verifica la cuenta, config/admin y despliega las reglas.'
          : `No se pudo cargar Auditoría: ${error.message}`, 'danger');
      });
  }

  function ensureNavigation() {
    const sidebar = document.querySelector('.admin-sidebar');
    if (!sidebar || sidebar.querySelector('[data-admin-section="auditoria"]')) return;
    const link = document.createElement('a');
    link.href = '#';
    link.className = 'nav-link';
    link.dataset.adminSection = 'auditoria';
    link.innerHTML = '<i class="bi bi-shield-check"></i> Auditoría';
    const appearance = sidebar.querySelector('[data-admin-section="apariencia"]');
    if (appearance) sidebar.insertBefore(link, appearance);
    else sidebar.querySelector('.mt-auto')?.before(link) || sidebar.append(link);
  }

  function ensureSection() {
    if (document.getElementById('sec-auditoria')) return;
    const content = document.querySelector('.admin-content');
    if (!content) return;
    const section = document.createElement('div');
    section.className = 'admin-section';
    section.id = 'sec-auditoria';
    section.innerHTML = `
      <div class="audit-toolbar d-flex align-items-center justify-content-between gap-3 flex-wrap mb-4">
        <div>
          <h2 class="section-title mb-1"><i class="bi bi-shield-check me-2"></i>Auditoría</h2>
          <p class="text-muted small mb-0">Registro del personal y de las modificaciones administrativas.</p>
        </div>
        <div class="d-flex gap-2 flex-wrap audit-actions">
          <div class="btn-group" role="group" aria-label="Período de auditoría">
            <button type="button" class="btn btn-primary btn-sm active" data-audit-period="day">Hoy</button>
            <button type="button" class="btn btn-outline-secondary btn-sm" data-audit-period="week">Semana</button>
            <button type="button" class="btn btn-outline-secondary btn-sm" data-audit-period="month">Mes</button>
          </div>
          <button type="button" class="btn btn-outline-secondary btn-sm" id="auditRefreshBtn"><i class="bi bi-arrow-clockwise me-1"></i>Actualizar</button>
          <button type="button" class="btn btn-danger btn-sm" id="auditPdfBtn"><i class="bi bi-file-earmark-pdf me-1"></i>Descargar PDF</button>
        </div>
      </div>
      <div class="row g-3 mb-4">
        <div class="col-12 col-sm-4"><div class="card audit-summary-card"><div class="card-body"><small class="text-muted">Eventos</small><div class="audit-value mt-2" id="auditTotalCount">0</div></div></div></div>
        <div class="col-12 col-sm-4"><div class="card audit-summary-card"><div class="card-body"><small class="text-muted">Personal identificado</small><div class="audit-value mt-2" id="auditPeopleCount">0</div></div></div></div>
        <div class="col-12 col-sm-4"><div class="card audit-summary-card"><div class="card-body"><small class="text-muted">Módulos modificados</small><div class="audit-value mt-2" id="auditModuleCount">0</div></div></div></div>
      </div>
      <div class="card">
        <div class="table-responsive">
          <table class="table table-hover mb-0 audit-table">
            <thead class="table-dark"><tr><th>Fecha</th><th>Personal</th><th>Acción</th><th>Módulo</th><th>Detalle</th><th>Registro</th></tr></thead>
            <tbody id="auditTableBody"><tr><td colspan="6" class="text-center py-5 text-muted"><span class="spinner-border spinner-border-sm me-2"></span>Cargando auditoría…</td></tr></tbody>
          </table>
        </div>
      </div>`;
    const appearance = document.getElementById('sec-apariencia');
    if (appearance) content.insertBefore(section, appearance);
    else content.append(section);
  }

  function activateSection(event) {
    event?.preventDefault();
    document.querySelectorAll('[data-admin-section]').forEach(item => item.classList.toggle('active', item.dataset.adminSection === 'auditoria'));
    document.querySelectorAll('.admin-section').forEach(item => item.classList.toggle('active', item.id === 'sec-auditoria'));
    subscribe();
  }

  function bindUi() {
    document.querySelector('.admin-sidebar [data-admin-section="auditoria"]')?.addEventListener('click', activateSection);
    document.querySelectorAll('[data-audit-period]').forEach(button => button.addEventListener('click', () => setPeriod(button.dataset.auditPeriod)));
    document.getElementById('auditRefreshBtn')?.addEventListener('click', () => {
      state.unsubscribe?.();
      state.unsubscribe = null;
      subscribe();
    });
    document.getElementById('auditPdfBtn')?.addEventListener('click', downloadPdf);
  }

  function pdfPeriodLabel() {
    return { day: 'Hoy', week: 'Semana actual', month: 'Mes actual' }[state.period] || 'Período';
  }

  function pdfFilename() {
    const date = new Date().toISOString().slice(0, 10);
    return `auditoria-${state.period}-${date}.pdf`;
  }

  function drawPdfHeader(doc, pageNumber, total) {
    const storeName = document.querySelector('.logo-text')?.textContent?.trim() || 'Kiosco';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(`${storeName} - Auditoría`, 14, 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Período: ${pdfPeriodLabel()} | Registros: ${total} | Página: ${pageNumber}`, 14, 21);
    doc.text(`Generado: ${formatDate(new Date())}`, 14, 26);
    doc.setDrawColor(160);
    doc.line(14, 29, 283, 29);
  }

  function downloadPdf() {
    const logs = filteredLogs();
    if (!logs.length) return toast('No hay registros para exportar en este período', 'warning');
    const JsPdf = window.jspdf?.jsPDF;
    if (!JsPdf) return toast('No se pudo cargar el generador de PDF. Verifica tu conexión.', 'danger');

    const doc = new JsPdf({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const columns = [
      { title: 'Fecha', x: 14, width: 34 },
      { title: 'Personal', x: 49, width: 43 },
      { title: 'Acción', x: 93, width: 30 },
      { title: 'Módulo', x: 124, width: 36 },
      { title: 'Detalle', x: 161, width: 104 },
      { title: 'Registro', x: 266, width: 17 }
    ];
    const marginBottom = 198;
    let pageNumber = 1;
    let y = 36;

    const drawTableHeader = () => {
      doc.setFillColor(35, 35, 42);
      doc.rect(14, y - 5, 269, 8, 'F');
      doc.setTextColor(255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      columns.forEach(column => doc.text(column.title, column.x + 1, y));
      doc.setTextColor(0);
      doc.setFont('helvetica', 'normal');
      y += 6;
    };

    drawPdfHeader(doc, pageNumber, logs.length);
    drawTableHeader();

    logs.forEach(log => {
      const actor = log.actor || {};
      const values = [
        formatDate(logDate(log)),
        `${actor.name || 'Administrador'}${actor.phone ? `\n${actor.phone}` : ''}`,
        log.actionLabel || actionLabels[log.action] || log.action || '',
        log.module || 'Sistema',
        log.description || '',
        log.entityId || '—'
      ];
      const wrapped = values.map((value, index) => doc.splitTextToSize(String(value), columns[index].width - 2));
      const rowHeight = Math.max(7, ...wrapped.map(lines => lines.length * 4 + 2));
      if (y + rowHeight > marginBottom) {
        doc.addPage('a4', 'landscape');
        pageNumber += 1;
        y = 36;
        drawPdfHeader(doc, pageNumber, logs.length);
        drawTableHeader();
      }
      doc.setDrawColor(210);
      doc.rect(14, y - 4, 269, rowHeight);
      doc.setFontSize(7.5);
      wrapped.forEach((lines, index) => doc.text(lines, columns[index].x + 1, y));
      y += rowHeight;
    });

    doc.save(pdfFilename());
    toast('PDF de auditoría descargado', 'success');
  }

  function bindSessionEvents() {
    window.auth?.onAuthStateChanged(async user => {
      if (!user || localStorage.getItem('kk_role') !== 'admin') {
        sessionStorage.removeItem(SESSION_LOGIN_KEY);
        return;
      }
      if (sessionStorage.getItem(SESSION_LOGIN_KEY)) return;
      sessionStorage.setItem(SESSION_LOGIN_KEY, 'true');
      const identity = await resolveIdentity(user);
      void writeAudit({ action: 'login', path: 'config/session', description: 'Inicio de sesión en el panel administrativo', identity });
    });

    ['logoutAdminBtn', 'logoutAdminBtn2', 'logoutAdminMobileBtn'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', () => {
        const user = window.auth?.currentUser;
        if (!user) return;
        void resolveIdentity(user).then(identity => writeAudit({
          action: 'logout',
          path: 'config/session',
          description: 'Cierre de sesión del panel administrativo',
          identity
        }));
      }, { capture: true });
    });
  }

  function init() {
    if (state.initialized) return;
    if (!window.db || !window.firebase || !window.auth) {
      window.setTimeout(init, 150);
      return;
    }
    state.initialized = true;
    patchFirestoreWrites();
    ensureNavigation();
    ensureSection();
    bindUi();
    bindSessionEvents();
  }

  window.KioscoAudit = Object.freeze({
    init,
    log(action, module, description, entityId = null) {
      const path = `${String(module || 'system').replace(/\s+/g, '_').toLowerCase()}/${entityId || 'manual'}`;
      return writeAudit({ action, path, description });
    },
    refresh() {
      state.unsubscribe?.();
      state.unsubscribe = null;
      subscribe();
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

// ===== Funcionalidad integrada: product experience =====
'use strict';

(function initializeKioscoProductExperience() {
  const VERSION = '1.0.1';
  const PRODUCT_HASH_PREFIX = '#producto-';
  const PUBLIC_STORE_URL = 'https://mi-kiosco-c7313.web.app/';
  const QR_CODE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode/1.5.1/qrcode.min.js';
  const JS_QR_CDN = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';

  if (window.KioscoProductExperience?.version) return;

  const state = {
    products: [],
    categories: [],
    currentProductId: null,
    suppressHistoryClear: false,
    initialHashHandled: false,
    qrDataUrl: '',
    scannerStream: null,
    scannerFrame: null,
    scannerBusy: false,
    scannerActive: false,
    scannerMode: null,
    productGridObserver: null
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normalizeId(value) {
    return String(value ?? '').trim();
  }

  function normalizeText(value) {
    return String(value ?? '').trim();
  }

  function formatMoney(value) {
    const amount = Number(value || 0);
    const currency = window.APP_CONFIG?.currency || 'S/';
    return `${currency} ${Number.isFinite(amount) ? amount.toFixed(2) : '0.00'}`;
  }

  function notify(message, type = 'info') {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
      return;
    }
    console.info(`[KioscoProductExperience:${type}] ${message}`);
  }

  function getModal(id) {
    const element = document.getElementById(id);
    if (!element || !window.bootstrap?.Modal) return null;
    return bootstrap.Modal.getOrCreateInstance(element);
  }

  function productUrl(productId) {
    const base = new URL(PUBLIC_STORE_URL);
    base.hash = `producto-${encodeURIComponent(normalizeId(productId))}`;
    return base.href;
  }

  function parseProductHash(hash = window.location.hash) {
    if (!String(hash).startsWith(PRODUCT_HASH_PREFIX)) return null;
    try {
      return decodeURIComponent(String(hash).slice(PRODUCT_HASH_PREFIX.length)).trim() || null;
    } catch (error) {
      console.warn('Hash de producto inválido:', error);
      return null;
    }
  }

  function getProduct(productId) {
    const id = normalizeId(productId);
    return state.products.find(product => normalizeId(product.id) === id) || null;
  }

  function getCategory(categoryId) {
    const id = normalizeId(categoryId);
    return state.categories.find(category => normalizeId(category.id) === id) || null;
  }

  function getImageUrl(product) {
    return normalizeText(product?.resolvedImageUrl || product?.imageUrl);
  }

  function hasUnlimitedStock(product) {
    return product?.stock === null || product?.stock === undefined || product?.stock === '';
  }

  function loadScript(source, globalName) {
    if (globalName && window[globalName]) return Promise.resolve(window[globalName]);
    return new Promise((resolve, reject) => {
      const existing = [...document.scripts].find(script => script.src === source);
      if (existing) {
        if (!globalName || window[globalName]) {
          resolve(globalName ? window[globalName] : true);
          return;
        }
        existing.addEventListener('load', () => resolve(window[globalName]), { once: true });
        existing.addEventListener('error', () => reject(new Error(`No se pudo cargar ${source}`)), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = source;
      script.async = true;
      script.addEventListener('load', () => resolve(globalName ? window[globalName] : true), { once: true });
      script.addEventListener('error', () => reject(new Error(`No se pudo cargar ${source}`)), { once: true });
      document.head.appendChild(script);
    });
  }

  function mountScannerButton() {
    if (document.getElementById('productQrScannerBtn')) return;
    const actions = document.querySelector('#page-store .header-actions');
    const profileButton = document.getElementById('profileBtn');
    if (!actions) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn-icon';
    button.id = 'productQrScannerBtn';
    button.title = 'Escanear QR de producto';
    button.setAttribute('aria-label', 'Escanear código QR de producto');
    button.innerHTML = '<i class="bi bi-camera" aria-hidden="true"></i>';
    actions.insertBefore(button, profileButton || null);
  }

  function mountModals() {
    if (document.getElementById('kioscoProductDetailModal')) return;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="modal fade" id="kioscoProductDetailModal" tabindex="-1" aria-labelledby="kioscoProductDetailTitle" aria-hidden="true">
        <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="kioscoProductDetailTitle">Detalle del producto</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
            </div>
            <div class="modal-body" id="kioscoProductDetailBody"></div>
          </div>
        </div>
      </div>

      <div class="modal fade" id="kioscoProductQrModal" tabindex="-1" aria-labelledby="kioscoProductQrTitle" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="kioscoProductQrTitle"><i class="bi bi-qr-code me-2"></i>QR del producto</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
            </div>
            <div class="modal-body text-center">
              <div class="kiosco-qr-canvas-wrap mx-auto mb-3">
                <canvas id="kioscoProductQrCanvas" width="280" height="280" aria-label="Código QR del producto"></canvas>
              </div>
              <div class="small text-muted text-break" id="kioscoProductQrUrl"></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cerrar</button>
              <button type="button" class="btn btn-primary" id="kioscoDownloadQrBtn">
                <i class="bi bi-download me-2"></i>Descargar PNG
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="modal fade" id="kioscoQrScannerModal" tabindex="-1" aria-labelledby="kioscoQrScannerTitle" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="kioscoQrScannerTitle"><i class="bi bi-camera me-2"></i>Escanear QR</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
            </div>
            <div class="modal-body">
              <div class="kiosco-scanner-viewport">
                <video id="kioscoQrScannerVideo" playsinline muted aria-label="Vista de la cámara"></video>
                <canvas id="kioscoQrScannerCanvas" hidden></canvas>
                <div class="kiosco-scanner-frame" aria-hidden="true"></div>
              </div>
              <div class="alert alert-secondary small mt-3 mb-0" id="kioscoQrScannerStatus" role="status">
                Preparando la cámara…
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            </div>
          </div>
        </div>
      </div>`;

    document.body.append(...wrapper.children);
  }

  function mountUi() {
    mountScannerButton();
    mountModals();
  }

  function decorateProductCards() {
    document.querySelectorAll('#productsGrid .prod-card[data-product-id]').forEach(card => {
      if (card.dataset.productExperienceBound === 'true') return;
      const product = getProduct(card.dataset.productId);
      if (!product) return;

      card.dataset.productExperienceBound = 'true';
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `Ver detalle de ${product.name}`);
      card.classList.add('kiosco-product-detail-trigger');

    });
  }

  function observeProductGrid() {
    const grid = document.getElementById('productsGrid');
    if (!grid || state.productGridObserver) return;
    state.productGridObserver = new MutationObserver(() => decorateProductCards());
    state.productGridObserver.observe(grid, { childList: true, subtree: true });
    decorateProductCards();
  }

  function stockPresentation(product) {
    if (hasUnlimitedStock(product)) {
      return {
        text: 'Stock ilimitado',
        detail: 'Disponible',
        barClass: 'bg-success',
        percent: 100,
        maxQty: 999,
        soldOut: false
      };
    }

    const stock = Math.max(0, Math.trunc(Number(product.stock) || 0));
    const barClass = stock > 10 ? 'bg-success' : stock > 5 ? 'bg-warning' : 'bg-danger';
    return {
      text: stock === 0 ? 'Sin stock' : `${stock} unidades disponibles`,
      detail: String(stock),
      barClass,
      percent: stock === 0 ? 0 : Math.max(8, Math.min(100, (stock / 15) * 100)),
      maxQty: Math.max(stock, 1),
      soldOut: stock === 0
    };
  }

  function chooseRelatedProducts(product) {
    const currentProductId = normalizeId(product.id);
    const candidates = state.products.filter(item => {
      const hasStock = hasUnlimitedStock(item) || Number(item.stock) > 0;
      return normalizeId(item.id) !== currentProductId && item.active !== false && hasStock;
    });
    const categoryKey = normalizeId(product.categoryId || product.subcategoryId);
    const sameCategory = categoryKey
      ? candidates.filter(item => normalizeId(item.categoryId || item.subcategoryId) === categoryKey)
      : [];

    if (sameCategory.length) return sameCategory.slice(0, 4);

    const shuffled = [...candidates];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled.slice(0, 4);
  }

  function relatedProductsMarkup(product) {
    const related = chooseRelatedProducts(product);
    if (!related.length) {
      return '<p class="text-muted small mb-0">No hay otros productos disponibles en este momento.</p>';
    }

    return `<div class="kiosco-related-scroll" role="list">
      ${related.map(item => {
        const imageUrl = getImageUrl(item);
        const soldOut = !hasUnlimitedStock(item) && Number(item.stock) <= 0;
        return `<article class="card kiosco-related-card" role="listitem" data-related-product-id="${escapeHtml(item.id)}">
          <button type="button" class="kiosco-related-open" data-kiosco-open-product="${escapeHtml(item.id)}" aria-label="Ver ${escapeHtml(item.name)}">
            <div class="kiosco-related-image">
              ${imageUrl
                ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.name)}" loading="lazy">`
                : '<div class="kiosco-related-placeholder"><i class="bi bi-bag" aria-hidden="true"></i></div>'}
            </div>
            <div class="p-2 text-start">
              <div class="small fw-semibold kiosco-related-name">${escapeHtml(item.name)}</div>
              <div class="fw-bold kiosco-accent-text">${escapeHtml(formatMoney(item.price))}</div>
            </div>
          </button>
          <div class="px-2 pb-2">
            <button type="button" class="btn btn-primary btn-sm w-100" data-kiosco-related-add="${escapeHtml(item.id)}" ${soldOut ? 'disabled' : ''}>
              <i class="bi bi-cart-plus me-1" aria-hidden="true"></i>${soldOut ? 'Agotado' : 'Agregar'}
            </button>
          </div>
        </article>`;
      }).join('')}
    </div>`;
  }

  function renderProductDetail(product) {
    const body = document.getElementById('kioscoProductDetailBody');
    const title = document.getElementById('kioscoProductDetailTitle');
    if (!body || !title) return;

    const imageUrl = getImageUrl(product);
    const stock = stockPresentation(product);
    const category = getCategory(product.categoryId);
    const subcategory = getCategory(product.subcategoryId);
    const categoryBadges = [category, subcategory]
      .filter(Boolean)
      .map(item => `<span class="badge text-bg-secondary">${escapeHtml(item.name)}</span>`)
      .join(' ');

    title.textContent = product.name || 'Detalle del producto';
    body.innerHTML = `
      <div class="row g-4">
        <div class="col-lg-5">
          <div class="kiosco-product-detail-image">
            ${imageUrl
              ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(product.name)}">`
              : '<div class="kiosco-product-detail-placeholder"><i class="bi bi-bag" aria-hidden="true"></i></div>'}
          </div>
        </div>
        <div class="col-lg-7 d-flex flex-column">
          <div class="d-flex flex-wrap gap-2 mb-2">${categoryBadges || '<span class="badge text-bg-secondary">Sin categoría</span>'}</div>
          <h2 class="h3 fw-bold mb-2">${escapeHtml(product.name)}</h2>
          <div class="kiosco-product-price mb-3">${escapeHtml(formatMoney(product.price))}</div>
          <p class="text-body-secondary kiosco-product-full-description">${escapeHtml(product.description || 'Sin descripción disponible.')}</p>

          <div class="mb-3">
            <div class="d-flex justify-content-between align-items-center small mb-1">
              <span class="fw-semibold">Disponibilidad</span>
              <span class="${stock.soldOut ? 'text-danger fw-semibold' : 'text-body-secondary'}">${escapeHtml(stock.text)}</span>
            </div>
            <div class="progress kiosco-stock-progress" role="progressbar" aria-label="Stock disponible" aria-valuenow="${stock.percent}" aria-valuemin="0" aria-valuemax="100">
              <div class="progress-bar ${stock.barClass}" style="width:${stock.percent}%"></div>
            </div>
          </div>

          <div class="row g-3 align-items-end mt-auto">
            <div class="col-sm-5 col-md-4">
              <label for="kioscoDetailQty" class="form-label fw-semibold">Cantidad</label>
              <div class="input-group">
                <button type="button" class="btn btn-outline-secondary" id="kioscoDetailQtyMinus" aria-label="Disminuir cantidad" ${stock.soldOut ? 'disabled' : ''}><i class="bi bi-dash"></i></button>
                <input type="number" class="form-control text-center" id="kioscoDetailQty" value="1" min="1" max="${stock.maxQty}" inputmode="numeric" ${stock.soldOut ? 'disabled' : ''}>
                <button type="button" class="btn btn-outline-secondary" id="kioscoDetailQtyPlus" aria-label="Aumentar cantidad" ${stock.soldOut ? 'disabled' : ''}><i class="bi bi-plus"></i></button>
              </div>
            </div>
            <div class="col-sm-7 col-md-8 d-grid gap-2">
              <button type="button" class="btn btn-primary" id="kioscoDetailAddBtn" data-product-id="${escapeHtml(product.id)}" ${stock.soldOut ? 'disabled' : ''}>
                <i class="bi bi-cart-plus me-2"></i>${stock.soldOut ? 'Producto agotado' : 'Agregar al carrito'}
              </button>
              <div class="d-flex gap-2">
                <button type="button" class="btn btn-outline-success flex-grow-1" data-kiosco-share-product="${escapeHtml(product.id)}">
                  Compartir
                </button>
                <button type="button" class="btn btn-outline-secondary" data-kiosco-product-qr="${escapeHtml(product.id)}" title="Generar QR" aria-label="Generar QR de ${escapeHtml(product.name)}">
                  <i class="bi bi-qr-code"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <section class="mt-4 pt-4 border-top" aria-labelledby="kioscoRelatedTitle">
        <h3 class="h5 fw-bold mb-3" id="kioscoRelatedTitle">También te puede interesar</h3>
        ${relatedProductsMarkup(product)}
      </section>`;
  }

  function normalizeDetailQuantity(product) {
    const input = document.getElementById('kioscoDetailQty');
    if (!input) return 1;
    const stock = hasUnlimitedStock(product) ? 999 : Math.max(0, Math.trunc(Number(product.stock) || 0));
    const requested = Math.trunc(Number(input.value) || 1);
    const quantity = Math.max(1, Math.min(requested, Math.max(stock, 1), 999));
    input.value = String(quantity);
    return quantity;
  }

  function scrollAndHighlightProduct(productId) {
    const id = normalizeId(productId);
    const searchInput = document.getElementById('searchInput');
    if (searchInput?.value) {
      searchInput.value = '';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    window.Store?.selectCategory?.(null, null);

    window.setTimeout(() => {
      decorateProductCards();
      const card = [...document.querySelectorAll('#productsGrid .prod-card[data-product-id]')]
        .find(item => normalizeId(item.dataset.productId) === id);
      if (!card) return;
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.remove('kiosco-product-deeplink-highlight');
      void card.offsetWidth;
      card.classList.add('kiosco-product-deeplink-highlight');
      window.setTimeout(() => card.classList.remove('kiosco-product-deeplink-highlight'), 2400);
    }, 280);
  }

  function openProduct(productOrId, options = {}) {
    const product = typeof productOrId === 'object' ? productOrId : getProduct(productOrId);
    if (!product) {
      notify('El producto solicitado no está disponible', 'warning');
      return false;
    }

    state.currentProductId = product.id;
    renderProductDetail(product);

    const desiredHash = `#producto-${encodeURIComponent(product.id)}`;
    if (options.pushHistory !== false && window.location.hash !== desiredHash) {
      window.history.pushState({ kioscoProduct: product.id }, '', desiredHash);
    }

    getModal('kioscoProductDetailModal')?.show();
    if (options.highlight !== false) scrollAndHighlightProduct(product.id);
    return true;
  }

  function shareProduct(productOrId) {
    const product = typeof productOrId === 'object' ? productOrId : getProduct(productOrId);
    if (!product) {
      notify('No se pudo compartir el producto', 'warning');
      return;
    }

    const stockText = hasUnlimitedStock(product)
      ? 'Stock disponible: ilimitado'
      : `Stock disponible: ${Math.max(0, Number(product.stock) || 0)}`;
    const lines = [
      `*${product.name}*`,
      `Precio: ${formatMoney(product.price)}`,
      product.description ? normalizeText(product.description) : null,
      stockText,
      productUrl(product.id)
    ].filter(Boolean);
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  }

  async function openProductQr(productOrId) {
    const product = typeof productOrId === 'object' ? productOrId : getProduct(productOrId);
    if (!product) {
      notify('No se pudo generar el QR del producto', 'warning');
      return false;
    }

    try {
      await loadScript(QR_CODE_CDN, 'QRCode');
      if (!window.QRCode?.toCanvas) throw new Error('La librería QR no está disponible');

      const canvas = document.getElementById('kioscoProductQrCanvas');
      const url = productUrl(product.id);
      document.getElementById('kioscoProductQrTitle').innerHTML = `<i class="bi bi-qr-code me-2"></i>${escapeHtml(product.name)}`;
      document.getElementById('kioscoProductQrUrl').textContent = url;
      await window.QRCode.toCanvas(canvas, url, {
        width: 280,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: '#111111', light: '#ffffff' }
      });
      state.qrDataUrl = canvas.toDataURL('image/png');
      document.getElementById('kioscoDownloadQrBtn').dataset.fileName = `qr-${String(product.name || product.id).replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()}.png`;
      getModal('kioscoProductQrModal')?.show();
      return true;
    } catch (error) {
      console.error('Generación QR:', error);
      notify(`No se pudo generar el QR: ${error.message}`, 'danger');
      return false;
    }
  }

  function downloadCurrentQr() {
    if (!state.qrDataUrl) return;
    const button = document.getElementById('kioscoDownloadQrBtn');
    const link = document.createElement('a');
    link.href = state.qrDataUrl;
    link.download = button?.dataset.fileName || 'producto-qr.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function scannerStatus(message, type = 'secondary') {
    const element = document.getElementById('kioscoQrScannerStatus');
    if (!element) return;
    element.className = `alert alert-${type} small mt-3 mb-0`;
    element.textContent = message;
  }

  function stopScanner() {
    state.scannerActive = false;
    state.scannerBusy = false;
    if (state.scannerFrame) cancelAnimationFrame(state.scannerFrame);
    state.scannerFrame = null;
    state.scannerStream?.getTracks?.().forEach(track => track.stop());
    state.scannerStream = null;
    state.scannerMode = null;
    const video = document.getElementById('kioscoQrScannerVideo');
    if (video) {
      video.pause();
      video.srcObject = null;
    }
  }

  function handleScannedValue(rawValue) {
    const value = normalizeText(rawValue);
    if (!value) return false;

    let hash = '';
    try {
      const parsed = new URL(value, window.location.href);
      hash = parsed.hash;
    } catch (error) {
      hash = value.startsWith('#') ? value : '';
    }

    const productId = parseProductHash(hash);
    const product = productId ? getProduct(productId) : null;
    if (!product) {
      scannerStatus('El QR no corresponde a un producto disponible de esta tienda.', 'warning');
      return false;
    }

    stopScanner();
    scannerStatus(`Producto detectado: ${product.name}`, 'success');
    state.suppressHistoryClear = true;
    getModal('kioscoQrScannerModal')?.hide();
    window.setTimeout(() => {
      state.suppressHistoryClear = false;
      openProduct(product, { pushHistory: true, highlight: true });
    }, 180);
    return true;
  }

  async function nativeScannerLoop(detector, video) {
    if (!state.scannerActive) return;
    if (!state.scannerBusy && video.readyState >= 2) {
      state.scannerBusy = true;
      try {
        const results = await detector.detect(video);
        const result = results.find(item => item.rawValue);
        if (result && handleScannedValue(result.rawValue)) return;
      } catch (error) {
        console.warn('BarcodeDetector:', error);
      } finally {
        state.scannerBusy = false;
      }
    }
    state.scannerFrame = requestAnimationFrame(() => nativeScannerLoop(detector, video));
  }

  function jsQrScannerLoop(video, canvas) {
    if (!state.scannerActive) return;
    if (!state.scannerBusy && video.readyState >= 2 && video.videoWidth && video.videoHeight) {
      state.scannerBusy = true;
      try {
        const width = Math.min(video.videoWidth, 960);
        const height = Math.round(width * (video.videoHeight / video.videoWidth));
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(video, 0, 0, width, height);
        const imageData = context.getImageData(0, 0, width, height);
        const result = window.jsQR(imageData.data, width, height, { inversionAttempts: 'dontInvert' });
        if (result?.data && handleScannedValue(result.data)) return;
      } catch (error) {
        console.warn('jsQR:', error);
      } finally {
        state.scannerBusy = false;
      }
    }
    state.scannerFrame = requestAnimationFrame(() => jsQrScannerLoop(video, canvas));
  }

  async function startScanner() {
    stopScanner();
    const video = document.getElementById('kioscoQrScannerVideo');
    const canvas = document.getElementById('kioscoQrScannerCanvas');
    if (!video || !canvas) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      scannerStatus('Este navegador no permite acceder a la cámara.', 'danger');
      return;
    }

    scannerStatus('Solicitando acceso a la cámara…', 'secondary');
    try {
      state.scannerStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      video.srcObject = state.scannerStream;
      await video.play();
      state.scannerActive = true;

      if ('BarcodeDetector' in window) {
        let supported = ['qr_code'];
        if (typeof window.BarcodeDetector.getSupportedFormats === 'function') {
          supported = await window.BarcodeDetector.getSupportedFormats();
        }
        if (supported.includes('qr_code')) {
          state.scannerMode = 'BarcodeDetector';
          scannerStatus('Apunta la cámara al código QR del producto.', 'info');
          const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
          nativeScannerLoop(detector, video);
          return;
        }
      }

      await loadScript(JS_QR_CDN, 'jsQR');
      if (typeof window.jsQR !== 'function') throw new Error('El lector QR alternativo no está disponible');
      state.scannerMode = 'jsQR';
      scannerStatus('Apunta la cámara al código QR del producto.', 'info');
      jsQrScannerLoop(video, canvas);
    } catch (error) {
      stopScanner();
      const denied = ['NotAllowedError', 'PermissionDeniedError'].includes(error?.name);
      scannerStatus(
        denied ? 'Permiso de cámara denegado. Habilítalo en la configuración del navegador.' : `No se pudo iniciar la cámara: ${error.message}`,
        'danger'
      );
    }
  }

  function openScanner() {
    const modalElement = document.getElementById('kioscoQrScannerModal');
    if (!modalElement) return;
    scannerStatus('Preparando la cámara…', 'secondary');
    getModal('kioscoQrScannerModal')?.show();
  }

  function handleProductHash(options = {}) {
    const productId = parseProductHash();
    if (!productId) return false;
    const product = getProduct(productId);
    if (!product) return false;
    openProduct(product, { pushHistory: false, highlight: options.highlight !== false });
    return true;
  }

  function handleDocumentClick(event) {
    const shareButton = event.target.closest('[data-kiosco-share-product]');
    if (shareButton) {
      event.preventDefault();
      event.stopPropagation();
      shareProduct(shareButton.dataset.kioscoShareProduct);
      return;
    }

    const qrButton = event.target.closest('[data-kiosco-product-qr]');
    if (qrButton) {
      event.preventDefault();
      event.stopPropagation();
      openProductQr(qrButton.dataset.kioscoProductQr);
      return;
    }

    const relatedAdd = event.target.closest('[data-kiosco-related-add]');
    if (relatedAdd) {
      event.preventDefault();
      event.stopPropagation();
      const product = getProduct(relatedAdd.dataset.kioscoRelatedAdd);
      if (product && window.Cart?.add?.(product, 1)) notify(`${product.name} agregado al carrito`, 'success');
      return;
    }

    const relatedOpen = event.target.closest('[data-kiosco-open-product]');
    if (relatedOpen) {
      event.preventDefault();
      openProduct(relatedOpen.dataset.kioscoOpenProduct, { pushHistory: true, highlight: true });
      return;
    }

    const addButton = event.target.closest('#kioscoDetailAddBtn');
    if (addButton) {
      event.preventDefault();
      const product = getProduct(addButton.dataset.productId);
      if (!product) return;
      const quantity = normalizeDetailQuantity(product);
      if (window.Cart?.add?.(product, quantity)) notify(`${quantity} ${quantity === 1 ? 'unidad agregada' : 'unidades agregadas'} al carrito`, 'success');
      return;
    }

    if (event.target.closest('#kioscoDetailQtyMinus, #kioscoDetailQtyPlus')) {
      const product = getProduct(state.currentProductId);
      const input = document.getElementById('kioscoDetailQty');
      if (!product || !input) return;
      const direction = event.target.closest('#kioscoDetailQtyPlus') ? 1 : -1;
      input.value = String((Number(input.value) || 1) + direction);
      normalizeDetailQuantity(product);
      return;
    }

    const card = event.target.closest('#productsGrid .prod-card[data-product-id]');
    if (card && !event.target.closest('button, input, select, textarea, a, [data-store-action]')) {
      openProduct(card.dataset.productId, { pushHistory: true, highlight: false });
    }
  }

  function handleDocumentKeydown(event) {
    const card = event.target.closest?.('#productsGrid .prod-card[data-product-id]');
    if (card && ['Enter', ' '].includes(event.key) && !event.target.closest('button, input, select, textarea, a')) {
      event.preventDefault();
      openProduct(card.dataset.productId, { pushHistory: true, highlight: false });
    }
  }

  function bindEvents() {
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleDocumentKeydown);
    document.addEventListener('change', event => {
      if (event.target.id !== 'kioscoDetailQty') return;
      const product = getProduct(state.currentProductId);
      if (product) normalizeDetailQuantity(product);
    });

    document.getElementById('productQrScannerBtn')?.addEventListener('click', openScanner);
    document.getElementById('kioscoDownloadQrBtn')?.addEventListener('click', downloadCurrentQr);

    const detailModal = document.getElementById('kioscoProductDetailModal');
    detailModal?.addEventListener('hidden.bs.modal', () => {
      if (!state.suppressHistoryClear && parseProductHash() === state.currentProductId) {
        window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
      }
      state.currentProductId = null;
    });

    const scannerModal = document.getElementById('kioscoQrScannerModal');
    scannerModal?.addEventListener('shown.bs.modal', startScanner);
    scannerModal?.addEventListener('hidden.bs.modal', stopScanner);

    window.addEventListener('store:products-updated', event => {
      state.products = Array.isArray(event.detail?.products) ? event.detail.products : [];
      decorateProductCards();
      if (!state.initialHashHandled && handleProductHash({ highlight: true })) state.initialHashHandled = true;
      if (state.currentProductId) {
        const current = getProduct(state.currentProductId);
        if (current) renderProductDetail(current);
      }
    });

    window.addEventListener('store:categories-updated', event => {
      state.categories = Array.isArray(event.detail?.categories) ? event.detail.categories : [];
      if (state.currentProductId) {
        const current = getProduct(state.currentProductId);
        if (current) renderProductDetail(current);
      }
    });

    window.addEventListener('popstate', () => {
      const productId = parseProductHash();
      if (productId) {
        handleProductHash({ highlight: true });
        return;
      }
      if (state.currentProductId) {
        state.suppressHistoryClear = true;
        getModal('kioscoProductDetailModal')?.hide();
        window.setTimeout(() => { state.suppressHistoryClear = false; }, 0);
      }
    });

    window.addEventListener('hashchange', () => {
      const productId = parseProductHash();
      if (productId && productId !== state.currentProductId) handleProductHash({ highlight: true });
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopScanner();
    });
  }

  function bootstrapData() {
    state.products = window.Store?.getProducts?.() || [];
    state.categories = window.Store?.getCategories?.() || [];
    observeProductGrid();
    decorateProductCards();
    if (state.products.length && handleProductHash({ highlight: true })) state.initialHashHandled = true;
  }

  mountUi();
  bindEvents();
  bootstrapData();

  window.KioscoProductExperience = Object.freeze({
    version: VERSION,
    openProduct,
    shareProduct,
    openProductQr,
    openScanner,
    productUrl,
    parseProductHash
  });
})();

// ===== Funcionalidad integrada: admin operations =====
'use strict';

(function initializeKioscoAdminOperations() {
  const VERSION = '1.0.1';
  const EXPENSE_CATEGORIES = ['Mercadería', 'Servicios', 'Transporte', 'Personal', 'Otros'];
  const CHART_CDN = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
  const XLSX_CDN = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
  const JSPDF_CDN = 'https://unpkg.com/jspdf@4.2.1/dist/jspdf.umd.min.js';
  const BATCH_SIZE = 10;

  if (window.KioscoAdminOperations?.version) return;

  const state = {
    expenses: [],
    expenseUnsubscribe: null,
    currentExpenseId: null,
    expenseChart: null,
    dashboardOrders: [],
    dashboardPeriod: 'day',
    adminProducts: [],
    adminCategories: [],
    adminGridObserver: null,
    replenishmentProductId: null,
    importRows: [],
    importFileName: '',
    importInProgress: false,
    exportInProgress: false
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normalizeId(value) {
    return String(value ?? '').trim();
  }

  function normalizeName(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLocaleLowerCase('es');
  }

  function notify(message, type = 'info') {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
      return;
    }
    console.info(`[KioscoAdminOperations:${type}] ${message}`);
  }

  function formatMoney(value) {
    const currency = window.APP_CONFIG?.currency || 'S/';
    const amount = Number(value || 0);
    return `${currency} ${Number.isFinite(amount) ? amount.toFixed(2) : '0.00'}`;
  }

  function toDate(value) {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDate(value) {
    const date = toDate(value);
    return date ? date.toLocaleDateString('es-PE') : '—';
  }

  function localDateInput(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function localMonthInput(date = new Date()) {
    return localDateInput(date).slice(0, 7);
  }

  function parseLocalDate(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function getModal(id) {
    const element = document.getElementById(id);
    if (!element || !window.bootstrap?.Modal) return null;
    return bootstrap.Modal.getOrCreateInstance(element);
  }

  function loadScript(source, globalName) {
    if (globalName && window[globalName]) return Promise.resolve(window[globalName]);
    return new Promise((resolve, reject) => {
      const existing = [...document.scripts].find(script => script.src === source);
      if (existing) {
        if (!globalName || window[globalName]) {
          resolve(globalName ? window[globalName] : true);
          return;
        }
        existing.addEventListener('load', () => resolve(window[globalName]), { once: true });
        existing.addEventListener('error', () => reject(new Error(`No se pudo cargar ${source}`)), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = source;
      script.async = true;
      script.addEventListener('load', () => resolve(globalName ? window[globalName] : true), { once: true });
      script.addEventListener('error', () => reject(new Error(`No se pudo cargar ${source}`)), { once: true });
      document.head.appendChild(script);
    });
  }

  function createExpensesNavigationLink() {
    const link = document.createElement('a');
    link.href = '#';
    link.className = 'nav-link';
    link.dataset.adminSection = 'expenses';
    link.innerHTML = '<i class="bi bi-receipt-cutoff"></i> Gastos';
    return link;
  }

  function mountExpensesNavigation() {
    const sidebar = document.querySelector('.admin-sidebar');
    if (sidebar && !sidebar.querySelector('[data-admin-section="expenses"]')) {
      const link = createExpensesNavigationLink();
      const scheduleLink = sidebar.querySelector('[data-admin-section="horario"]');
      if (scheduleLink) sidebar.insertBefore(link, scheduleLink);
      else sidebar.querySelector('.mt-auto')?.before(link);
    }

    const mobileNavigation = document.getElementById('adminNavMobile');
    if (mobileNavigation && !mobileNavigation.querySelector('[data-admin-section="expenses"]')) {
      const mobileLink = createExpensesNavigationLink();
      const mobileScheduleLink = mobileNavigation.querySelector('[data-admin-section="horario"]');
      if (mobileScheduleLink) mobileNavigation.insertBefore(mobileLink, mobileScheduleLink);
      else mobileNavigation.appendChild(mobileLink);
    }
  }

  function openExpensesSection(event) {
    event?.preventDefault();
    document.querySelectorAll('[data-admin-section]').forEach(element => {
      element.classList.toggle('active', element.dataset.adminSection === 'expenses');
    });
    document.querySelectorAll('.admin-section').forEach(element => {
      element.classList.toggle('active', element.id === 'sec-expenses');
    });
    const offcanvas = document.getElementById('adminOffcanvas');
    if (offcanvas && window.bootstrap?.Offcanvas) {
      window.bootstrap.Offcanvas.getInstance(offcanvas)?.hide();
    }
    subscribeExpenses();
    renderExpenses();
  }

  function expenseCategoryCardsMarkup() {
    return EXPENSE_CATEGORIES.map(category => `
      <div class="col-6 col-md-4 col-xl">
        <div class="card h-100 kiosco-expense-summary-card">
          <div class="card-body py-3">
            <div class="small text-body-secondary">${escapeHtml(category)}</div>
            <div class="fw-bold mt-1" data-expense-category-total="${escapeHtml(category)}">${escapeHtml(formatMoney(0))}</div>
          </div>
        </div>
      </div>`).join('');
  }

  function mountExpensesSection() {
    if (document.getElementById('sec-expenses')) return;
    const content = document.querySelector('.admin-content');
    if (!content) return;

    const section = document.createElement('div');
    section.className = 'admin-section';
    section.id = 'sec-expenses';
    section.innerHTML = `
      <div class="d-flex align-items-start justify-content-between gap-3 flex-wrap mb-4">
        <div>
          <h2 class="section-title mb-1"><i class="bi bi-receipt-cutoff me-2"></i>Gastos</h2>
          <p class="text-body-secondary small mb-0">Control mensual de egresos operativos.</p>
        </div>
        <div class="d-flex gap-2 flex-wrap">
          <input type="month" class="form-control form-control-sm kiosco-month-input" id="expenseMonthFilter" value="${localMonthInput()}" aria-label="Mes de gastos">
          <button type="button" class="btn btn-outline-success btn-sm" id="exportExpensesBtn">
            <i class="bi bi-file-earmark-excel me-1"></i>Exportar Excel
          </button>
          <button type="button" class="btn btn-primary btn-sm" id="addExpenseBtn">
            <i class="bi bi-plus-lg me-1"></i>Nuevo gasto
          </button>
        </div>
      </div>
      <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <h3 class="h6 mb-0">Resumen por categoría</h3>
        <div class="fw-bold">Total del mes: <span class="kiosco-accent-text" id="expensesMonthTotal">${escapeHtml(formatMoney(0))}</span></div>
      </div>
      <div class="row g-3 mb-4 kiosco-expense-summary-row">${expenseCategoryCardsMarkup()}</div>
      <div class="card mb-4">
        <div class="card-header fw-semibold"><i class="bi bi-bar-chart me-2"></i>Gastos por día</div>
        <div class="card-body kiosco-expense-chart-wrap"><canvas id="expensesByDayChart"></canvas></div>
      </div>
      <div class="card">
        <div class="table-responsive">
          <table class="table table-hover align-middle mb-0">
            <thead class="table-dark">
              <tr><th>Fecha</th><th>Descripción</th><th>Categoría</th><th class="text-end">Monto</th><th class="text-end">Acciones</th></tr>
            </thead>
            <tbody id="expensesTableBody">
              <tr><td colspan="5" class="text-center text-body-secondary py-5">Inicia sesión para consultar los gastos.</td></tr>
            </tbody>
          </table>
        </div>
      </div>`;

    const scheduleSection = document.getElementById('sec-horario');
    if (scheduleSection) content.insertBefore(section, scheduleSection);
    else content.appendChild(section);
  }

  function mountProductActions() {
    if (document.getElementById('importProductsExcelBtn')) return;
    const section = document.getElementById('sec-products');
    const header = section?.querySelector(':scope > .d-flex');
    const addButton = document.getElementById('btnAddProduct');
    if (!header || !addButton) return;

    header.classList.add('flex-wrap', 'gap-2');
    const actions = document.createElement('div');
    actions.className = 'd-flex gap-2 flex-wrap justify-content-end';
    actions.innerHTML = `
      <button type="button" class="btn btn-outline-success btn-sm" id="importProductsExcelBtn">
        <i class="bi bi-file-earmark-excel me-1"></i>Importar desde Excel
      </button>
      <button type="button" class="btn btn-outline-danger btn-sm" id="exportCatalogPdfBtn">
        <i class="bi bi-file-pdf me-1"></i>Exportar catálogo PDF
      </button>`;
    actions.appendChild(addButton);
    header.appendChild(actions);
  }

  function mountDashboardFinancialMetrics() {
    if (document.getElementById('dashExpenses')) return;
    const revenueElement = document.getElementById('dashRevenue');
    const baseRow = revenueElement?.closest('.row');
    if (!baseRow) return;

    const row = document.createElement('div');
    row.className = 'row g-3 mb-4';
    row.id = 'kioscoFinancialMetricsRow';
    row.innerHTML = `
      <div class="col-12 col-md-6">
        <div class="stat-card card h-100">
          <div class="stat-icon bg-danger bg-opacity-10 text-danger"><i class="bi bi-receipt-cutoff"></i></div>
          <div>
            <div class="stat-value" id="dashExpenses">${escapeHtml(formatMoney(0))}</div>
            <div class="stat-label">Gastos del período</div>
          </div>
        </div>
      </div>
      <div class="col-12 col-md-6">
        <div class="stat-card card h-100">
          <div class="stat-icon bg-success bg-opacity-10" id="dashNetUtilityIcon"><i class="bi bi-graph-up-arrow"></i></div>
          <div>
            <div class="stat-value text-success" id="dashNetUtility">${escapeHtml(formatMoney(0))}</div>
            <div class="stat-label">Utilidad neta</div>
          </div>
        </div>
      </div>`;
    baseRow.insertAdjacentElement('afterend', row);
  }

  function mountAdminModals() {
    if (document.getElementById('expenseModal')) return;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="modal fade" id="expenseModal" tabindex="-1" aria-labelledby="expenseModalTitle" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <form id="expenseForm">
              <div class="modal-header">
                <h5 class="modal-title" id="expenseModalTitle"><i class="bi bi-receipt-cutoff me-2"></i>Nuevo gasto</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
              </div>
              <div class="modal-body">
                <input type="hidden" id="expenseId">
                <div class="mb-3">
                  <label for="expenseDescription" class="form-label fw-semibold">Descripción</label>
                  <input type="text" class="form-control" id="expenseDescription" maxlength="160" required>
                </div>
                <div class="row g-3">
                  <div class="col-sm-6">
                    <label for="expenseAmount" class="form-label fw-semibold">Monto</label>
                    <div class="input-group"><span class="input-group-text">S/</span><input type="number" class="form-control" id="expenseAmount" min="0.01" step="0.01" required></div>
                  </div>
                  <div class="col-sm-6">
                    <label for="expenseDate" class="form-label fw-semibold">Fecha</label>
                    <input type="date" class="form-control" id="expenseDate" required>
                  </div>
                  <div class="col-12">
                    <label for="expenseCategory" class="form-label fw-semibold">Categoría</label>
                    <select class="form-select" id="expenseCategory" required>
                      ${EXPENSE_CATEGORIES.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('')}
                    </select>
                  </div>
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
                <button type="submit" class="btn btn-primary" id="saveExpenseBtn"><i class="bi bi-save me-2"></i>Guardar</button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div class="modal fade" id="stockReplenishmentModal" tabindex="-1" aria-labelledby="stockReplenishmentTitle" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <form id="stockReplenishmentForm">
              <div class="modal-header">
                <h5 class="modal-title" id="stockReplenishmentTitle"><i class="bi bi-box-arrow-in-down me-2"></i>Reponer stock</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
              </div>
              <div class="modal-body">
                <p class="mb-3" id="stockReplenishmentProduct"></p>
                <div class="row g-3">
                  <div class="col-sm-6"><div class="card h-100"><div class="card-body"><small class="text-body-secondary">Stock actual</small><div class="h4 mb-0 mt-1" id="stockReplenishmentCurrent">0</div></div></div></div>
                  <div class="col-sm-6">
                    <label for="stockReplenishmentQty" class="form-label fw-semibold">Cantidad a sumar</label>
                    <input type="number" class="form-control form-control-lg" id="stockReplenishmentQty" min="1" step="1" value="1" required>
                  </div>
                </div>
                <div class="alert alert-info small mt-3 mb-0"><i class="bi bi-info-circle me-2"></i>La cantidad se sumará al stock actual y el movimiento quedará registrado en Auditoría.</div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
                <button type="submit" class="btn btn-primary" id="saveStockReplenishmentBtn"><i class="bi bi-plus-circle me-2"></i>Sumar stock</button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div class="modal fade" id="productsExcelImportModal" tabindex="-1" aria-labelledby="productsExcelImportTitle" aria-hidden="true">
        <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="productsExcelImportTitle"><i class="bi bi-file-earmark-excel me-2"></i>Importar productos desde Excel</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
            </div>
            <div class="modal-body">
              <div class="row g-4">
                <div class="col-lg-4">
                  <div class="card h-100">
                    <div class="card-body">
                      <h6 class="fw-bold">1. Descarga la plantilla</h6>
                      <p class="small text-body-secondary">Incluye las columnas esperadas y ejemplos compatibles con las categorías actuales.</p>
                      <button type="button" class="btn btn-outline-success w-100" id="downloadProductsTemplateBtn"><i class="bi bi-download me-2"></i>Descargar plantilla Excel</button>
                      <hr>
                      <h6 class="fw-bold">2. Selecciona el archivo</h6>
                      <input type="file" class="form-control" id="productsExcelFile" accept=".xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
                      <div class="form-text">Máximo recomendado: 1,000 filas por operación.</div>
                    </div>
                  </div>
                </div>
                <div class="col-lg-8">
                  <div class="d-flex justify-content-between align-items-center gap-2 mb-2">
                    <h6 class="fw-bold mb-0">Vista previa</h6>
                    <span class="badge text-bg-secondary" id="productsImportRowCount">0 filas</span>
                  </div>
                  <div class="table-responsive border rounded kiosco-import-preview-wrap">
                    <table class="table table-sm table-hover align-middle mb-0">
                      <thead class="table-dark"><tr><th>Fila</th><th>Nombre</th><th>Precio</th><th>Stock</th><th>Categoría</th><th>Activo</th></tr></thead>
                      <tbody id="productsImportPreview"><tr><td colspan="6" class="text-center text-body-secondary py-5">Selecciona un archivo para ver los primeros 5 registros.</td></tr></tbody>
                    </table>
                  </div>
                </div>
              </div>
              <div class="mt-4 d-none" id="productsImportProgressWrap">
                <div class="d-flex justify-content-between small mb-1"><span id="productsImportProgressText">Preparando importación…</span><span id="productsImportProgressPercent">0%</span></div>
                <div class="progress" role="progressbar" aria-label="Progreso de importación"><div class="progress-bar progress-bar-striped progress-bar-animated" id="productsImportProgressBar" style="width:0%"></div></div>
              </div>
              <div class="mt-4 d-none" id="productsImportResult" role="status"></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal" id="closeProductsImportBtn">Cerrar</button>
              <button type="button" class="btn btn-success" id="runProductsImportBtn" disabled><i class="bi bi-cloud-arrow-up me-2"></i>Importar 0 productos</button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.append(...wrapper.children);
  }

  function mountUi() {
    window.COLL = window.COLL || {};
    window.COLL.expenses = window.COLL.expenses || 'expenses';
    mountExpensesNavigation();
    mountExpensesSection();
    mountProductActions();
    mountDashboardFinancialMetrics();
    mountAdminModals();
  }

  function expenseMonth() {
    return document.getElementById('expenseMonthFilter')?.value || localMonthInput();
  }

  function expensesForMonth(month = expenseMonth()) {
    return state.expenses
      .filter(expense => {
        const date = toDate(expense.date);
        return date && localMonthInput(date) === month;
      })
      .sort((a, b) => (toDate(b.date)?.getTime() || 0) - (toDate(a.date)?.getTime() || 0));
  }

  function subscribeExpenses() {
    if (state.expenseUnsubscribe || !window.db || !window.auth?.currentUser) return;
    state.expenseUnsubscribe = db.collection(COLL.expenses || 'expenses').onSnapshot(snapshot => {
      state.expenses = snapshot.docs.map(documentSnapshot => ({ id: documentSnapshot.id, ...documentSnapshot.data() }));
      state.expenses.sort((a, b) => (toDate(b.date)?.getTime() || 0) - (toDate(a.date)?.getTime() || 0));
      renderExpenses();
      renderDashboardFinancials();
    }, error => {
      console.error('Gastos:', error);
      notify(error?.code === 'permission-denied'
        ? 'Sin permiso para consultar gastos. Despliega las reglas de Firestore incluidas.'
        : `No se pudieron cargar los gastos: ${error.message}`, 'danger');
    });
  }

  function unsubscribeExpenses() {
    if (typeof state.expenseUnsubscribe === 'function') state.expenseUnsubscribe();
    state.expenseUnsubscribe = null;
    state.expenses = [];
    renderExpenses();
    renderDashboardFinancials();
  }

  function renderExpenseSummary(list) {
    const totals = Object.fromEntries(EXPENSE_CATEGORIES.map(category => [category, 0]));
    list.forEach(expense => {
      const category = EXPENSE_CATEGORIES.includes(expense.category) ? expense.category : 'Otros';
      totals[category] += Number(expense.amount || 0);
    });

    EXPENSE_CATEGORIES.forEach(category => {
      const element = [...document.querySelectorAll('[data-expense-category-total]')]
        .find(item => item.dataset.expenseCategoryTotal === category);
      if (element) element.textContent = formatMoney(totals[category]);
    });
    const total = Object.values(totals).reduce((sum, value) => sum + value, 0);
    const totalElement = document.getElementById('expensesMonthTotal');
    if (totalElement) totalElement.textContent = formatMoney(total);
  }

  async function renderExpensesChart(list) {
    const canvas = document.getElementById('expensesByDayChart');
    if (!canvas) return;
    try {
      await loadScript(CHART_CDN, 'Chart');
    } catch (error) {
      console.warn('Chart.js para gastos:', error);
      return;
    }

    const [yearValue, monthValue] = expenseMonth().split('-').map(Number);
    const daysInMonth = new Date(yearValue, monthValue, 0).getDate();
    const daily = Array.from({ length: daysInMonth }, () => 0);
    list.forEach(expense => {
      const date = toDate(expense.date);
      if (date) daily[date.getDate() - 1] += Number(expense.amount || 0);
    });

    state.expenseChart?.destroy();
    const styles = getComputedStyle(document.documentElement);
    const accent = styles.getPropertyValue('--accent').trim() || '#f97316';
    const textColor = styles.getPropertyValue('--bs-body-color').trim() || '#6c757d';
    const borderColor = styles.getPropertyValue('--bs-border-color').trim() || 'rgba(127,127,127,.2)';
    state.expenseChart = new window.Chart(canvas, {
      type: 'bar',
      data: {
        labels: daily.map((_, index) => String(index + 1)),
        datasets: [{ label: 'Gastos', data: daily.map(value => Number(value.toFixed(2))), backgroundColor: accent, borderRadius: 5, maxBarThickness: 24 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: context => formatMoney(context.parsed.y) } } },
        scales: {
          x: { title: { display: true, text: 'Día del mes', color: textColor }, ticks: { color: textColor }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: textColor, callback: value => formatMoney(value) }, grid: { color: borderColor } }
        }
      }
    });
  }

  function renderExpensesTable(list) {
    const body = document.getElementById('expensesTableBody');
    if (!body) return;
    if (!window.auth?.currentUser) {
      body.innerHTML = '<tr><td colspan="5" class="text-center text-body-secondary py-5">Inicia sesión para consultar los gastos.</td></tr>';
      return;
    }
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="5" class="text-center text-body-secondary py-5"><i class="bi bi-receipt-cutoff display-6 d-block mb-2"></i>No hay gastos registrados en este mes.</td></tr>';
      return;
    }
    body.innerHTML = list.map(expense => `
      <tr>
        <td class="text-nowrap">${escapeHtml(formatDate(expense.date))}</td>
        <td>${escapeHtml(expense.description || '')}</td>
        <td><span class="badge text-bg-secondary">${escapeHtml(expense.category || 'Otros')}</span></td>
        <td class="text-end fw-semibold">${escapeHtml(formatMoney(expense.amount))}</td>
        <td class="text-end text-nowrap">
          <button type="button" class="btn btn-outline-primary btn-sm" data-edit-expense="${escapeHtml(expense.id)}" aria-label="Editar gasto"><i class="bi bi-pencil"></i></button>
          <button type="button" class="btn btn-outline-danger btn-sm" data-delete-expense="${escapeHtml(expense.id)}" aria-label="Eliminar gasto"><i class="bi bi-trash"></i></button>
        </td>
      </tr>`).join('');
  }

  function renderExpenses() {
    const list = expensesForMonth();
    renderExpenseSummary(list);
    renderExpensesTable(list);
    void renderExpensesChart(list);
  }

  function openExpenseModal(expenseId = null) {
    const form = document.getElementById('expenseForm');
    const expense = expenseId ? state.expenses.find(item => item.id === expenseId) : null;
    state.currentExpenseId = expense?.id || null;
    form?.reset();
    document.getElementById('expenseId').value = expense?.id || '';
    document.getElementById('expenseDescription').value = expense?.description || '';
    document.getElementById('expenseAmount').value = expense ? String(Number(expense.amount || 0)) : '';
    document.getElementById('expenseCategory').value = EXPENSE_CATEGORIES.includes(expense?.category) ? expense.category : 'Mercadería';
    document.getElementById('expenseDate').value = expense ? localDateInput(toDate(expense.date) || new Date()) : localDateInput();
    document.getElementById('expenseModalTitle').innerHTML = `<i class="bi bi-receipt-cutoff me-2"></i>${expense ? 'Editar gasto' : 'Nuevo gasto'}`;
    getModal('expenseModal')?.show();
  }

  async function saveExpense(event) {
    event.preventDefault();
    if (!window.auth?.currentUser) return notify('Debes iniciar sesión como administrador', 'warning');
    const description = document.getElementById('expenseDescription').value.trim();
    const amount = Number(document.getElementById('expenseAmount').value);
    const category = document.getElementById('expenseCategory').value;
    const date = parseLocalDate(document.getElementById('expenseDate').value);
    if (!description) return notify('La descripción es obligatoria', 'warning');
    if (!Number.isFinite(amount) || amount <= 0) return notify('Ingresa un monto mayor que cero', 'warning');
    if (!EXPENSE_CATEGORIES.includes(category)) return notify('Selecciona una categoría válida', 'warning');
    if (!date) return notify('Selecciona una fecha válida', 'warning');

    const button = document.getElementById('saveExpenseBtn');
    const originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Guardando…';
    try {
      const payload = {
        description,
        amount: Number(amount.toFixed(2)),
        category,
        date: firebase.firestore.Timestamp.fromDate(date)
      };
      if (state.currentExpenseId) {
        await db.collection(COLL.expenses || 'expenses').doc(state.currentExpenseId).update(payload);
        notify('Gasto actualizado', 'success');
      } else {
        await db.collection(COLL.expenses || 'expenses').add({
          ...payload,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        notify('Gasto registrado', 'success');
      }
      getModal('expenseModal')?.hide();
    } catch (error) {
      console.error('Guardar gasto:', error);
      notify(`No se pudo guardar el gasto: ${error.message}`, 'danger');
    } finally {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
  }

  async function deleteExpense(expenseId) {
    const expense = state.expenses.find(item => item.id === expenseId);
    if (!expense || !window.confirm(`¿Eliminar el gasto “${expense.description}”?`)) return;
    try {
      await db.collection(COLL.expenses || 'expenses').doc(expense.id).delete();
      notify('Gasto eliminado', 'info');
    } catch (error) {
      console.error('Eliminar gasto:', error);
      notify(`No se pudo eliminar el gasto: ${error.message}`, 'danger');
    }
  }

  async function ensureXlsx() {
    await loadScript(XLSX_CDN, 'XLSX');
    if (!window.XLSX) throw new Error('SheetJS no está disponible');
    return window.XLSX;
  }

  async function exportExpenses() {
    const list = expensesForMonth();
    if (!list.length) return notify('No hay gastos para exportar en este mes', 'warning');
    const button = document.getElementById('exportExpensesBtn');
    const originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Generando…';
    try {
      const XLSX = await ensureXlsx();
      const detail = list.map(expense => ({
        Fecha: formatDate(expense.date),
        Descripción: expense.description || '',
        Categoría: expense.category || 'Otros',
        Monto: Number(expense.amount || 0)
      }));
      const categoryTotals = EXPENSE_CATEGORIES.map(category => ({
        Categoría: category,
        Total: Number(list.filter(expense => expense.category === category).reduce((sum, expense) => sum + Number(expense.amount || 0), 0).toFixed(2))
      }));
      const workbook = XLSX.utils.book_new();
      const detailSheet = XLSX.utils.json_to_sheet(detail);
      detailSheet['!cols'] = [{ wch: 14 }, { wch: 42 }, { wch: 18 }, { wch: 14 }];
      const summarySheet = XLSX.utils.json_to_sheet(categoryTotals);
      summarySheet['!cols'] = [{ wch: 20 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(workbook, detailSheet, 'Gastos');
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen');
      XLSX.writeFile(workbook, `gastos-${expenseMonth()}.xlsx`, { compression: true });
      notify('Excel de gastos descargado', 'success');
    } catch (error) {
      console.error('Exportar gastos:', error);
      notify(`No se pudo exportar el Excel: ${error.message}`, 'danger');
    } finally {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
  }

  function periodRange(period, baseDate = new Date()) {
    if (window.Dashboard?.getPeriodRange) return window.Dashboard.getPeriodRange(period, baseDate);
    const start = new Date(baseDate);
    const end = new Date(baseDate);
    if (period === 'day') {
      start.setHours(0, 0, 0, 0);
      end.setTime(start.getTime());
      end.setDate(end.getDate() + 1);
      return { start, end };
    }
    if (period === 'week') {
      const day = start.getDay();
      start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
      start.setHours(0, 0, 0, 0);
      end.setTime(start.getTime());
      end.setDate(end.getDate() + 7);
      return { start, end };
    }
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setTime(start.getTime());
    end.setMonth(end.getMonth() + 1);
    return { start, end };
  }

  function renderDashboardFinancials() {
    const { start, end } = periodRange(state.dashboardPeriod);
    const expenses = state.expenses.filter(expense => {
      const date = toDate(expense.date);
      return date && date >= start && date < end;
    }).reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const revenue = state.dashboardOrders.filter(order => {
      const date = toDate(order.createdAt);
      return date && date >= start && date < end && order.status !== 'rejected';
    }).reduce((sum, order) => sum + Number(order.total || 0), 0);
    const net = Number((revenue - expenses).toFixed(2));
    const isPositive = net > 0;
    const isNegative = net < 0;
    const isNeutral = !isPositive && !isNegative;

    const expensesElement = document.getElementById('dashExpenses');
    const netElement = document.getElementById('dashNetUtility');
    const iconElement = document.getElementById('dashNetUtilityIcon');
    if (expensesElement) expensesElement.textContent = formatMoney(expenses);
    if (netElement) {
      netElement.textContent = formatMoney(net);
      netElement.classList.toggle('text-success', isPositive);
      netElement.classList.toggle('text-danger', isNegative);
      netElement.classList.toggle('text-body-secondary', isNeutral);
    }
    if (iconElement) {
      iconElement.classList.toggle('text-success', isPositive);
      iconElement.classList.toggle('text-danger', isNegative);
      iconElement.classList.toggle('text-body-secondary', isNeutral);
      iconElement.classList.toggle('bg-success', isPositive);
      iconElement.classList.toggle('bg-danger', isNegative);
      iconElement.classList.toggle('bg-secondary', isNeutral);
    }
  }

  function getAdminApi() {
    if (window.Admin) return window.Admin;
    try {
      return typeof Admin !== 'undefined' ? Admin : null;
    } catch (error) {
      return null;
    }
  }

  function getAdminProducts() {
    const products = getAdminApi()?.getProducts?.();
    if (Array.isArray(products)) state.adminProducts = products;
    return state.adminProducts;
  }

  function getAdminCategories() {
    const categories = getAdminApi()?.getCategories?.();
    if (Array.isArray(categories)) state.adminCategories = categories;
    return state.adminCategories;
  }

  function decorateAdminProductCards() {
    const products = getAdminProducts();
    const byId = new Map(products.map(product => [normalizeId(product.id), product]));
    document.querySelectorAll('#adminProductsGrid [data-admin-product-id]').forEach(container => {
      const product = byId.get(normalizeId(container.dataset.adminProductId));
      if (!product) return;
      const card = container.matches('.card') ? container : container.querySelector('.card');
      if (!card) return;

      const stock = product.stock === null || product.stock === undefined || product.stock === ''
        ? null
        : Math.max(0, Math.trunc(Number(product.stock) || 0));
      const decorationSignature = [
        normalizeId(product.id),
        stock === null ? 'unlimited' : String(stock),
        product.active !== false ? 'active' : 'inactive',
        normalizeName(product.name)
      ].join('|');
      if (card.dataset.kioscoAdminDecoration === decorationSignature
          && card.querySelector('.kiosco-admin-extra-actions')) return;
      card.dataset.kioscoAdminDecoration = decorationSignature;
      card.querySelectorAll('[data-kiosco-stock-badge], .kiosco-admin-extra-actions').forEach(element => element.remove());
      const imageWrap = card.querySelector('.card-img-wrap');
      if (imageWrap && stock !== null && stock <= 5) {
        imageWrap.classList.add('position-relative');
        const badge = document.createElement('span');
        badge.dataset.kioscoStockBadge = 'true';
        badge.className = stock === 0
          ? 'badge bg-danger position-absolute top-0 end-0 m-2 kiosco-stock-out-badge'
          : 'badge bg-warning text-dark position-absolute top-0 end-0 m-2';
        badge.textContent = stock === 0 ? 'Sin stock' : 'Stock bajo';
        imageWrap.appendChild(badge);
      }

      const actions = document.createElement('div');
      actions.className = 'kiosco-admin-extra-actions d-flex gap-2 p-2 pt-0';
      actions.innerHTML = `
        <button type="button" class="btn btn-outline-primary btn-sm flex-grow-1" data-replenish-product="${escapeHtml(product.id)}" ${stock === null ? 'disabled title="Producto con stock ilimitado"' : ''}>
          <i class="bi bi-box-arrow-in-down me-1"></i>Reponer stock
        </button>
        <button type="button" class="btn btn-outline-secondary btn-sm" data-admin-product-qr="${escapeHtml(product.id)}" title="Generar QR" aria-label="Generar QR de ${escapeHtml(product.name)}">
          <i class="bi bi-qr-code"></i>
        </button>`;
      card.appendChild(actions);
    });
  }

  function observeAdminProductGrid() {
    const grid = document.getElementById('adminProductsGrid');
    if (!grid || state.adminGridObserver) return;
    state.adminGridObserver = new MutationObserver(() => decorateAdminProductCards());
    state.adminGridObserver.observe(grid, { childList: true, subtree: true });
    decorateAdminProductCards();
  }

  function openReplenishmentModal(productId) {
    const product = getAdminProducts().find(item => item.id === productId);
    if (!product) return notify('Producto no encontrado', 'warning');
    if (product.stock === null || product.stock === undefined || product.stock === '') {
      return notify('Este producto usa stock ilimitado', 'warning');
    }
    state.replenishmentProductId = product.id;
    document.getElementById('stockReplenishmentTitle').innerHTML = '<i class="bi bi-box-arrow-in-down me-2"></i>Reponer stock';
    document.getElementById('stockReplenishmentProduct').innerHTML = `<strong>${escapeHtml(product.name)}</strong>`;
    document.getElementById('stockReplenishmentCurrent').textContent = String(Math.max(0, Math.trunc(Number(product.stock) || 0)));
    document.getElementById('stockReplenishmentQty').value = '1';
    getModal('stockReplenishmentModal')?.show();
  }

  async function saveStockReplenishment(event) {
    event.preventDefault();
    const productId = state.replenishmentProductId;
    const addedQty = Math.trunc(Number(document.getElementById('stockReplenishmentQty').value));
    if (!productId) return notify('Producto no seleccionado', 'warning');
    if (!Number.isFinite(addedQty) || addedQty <= 0) return notify('La cantidad debe ser un entero mayor que cero', 'warning');
    if (!window.auth?.currentUser) return notify('Debes iniciar sesión como administrador', 'warning');

    const button = document.getElementById('saveStockReplenishmentBtn');
    const originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Actualizando…';
    try {
      const productReference = db.collection(COLL.products).doc(productId);
      const auditReference = db.collection(COLL.audit || 'audit_log').doc();
      const user = auth.currentUser;
      let result = null;
      await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(productReference);
        if (!snapshot.exists) throw new Error('El producto ya no existe');
        const product = snapshot.data() || {};
        if (product.stock === null || product.stock === undefined || product.stock === '') throw new Error('El producto usa stock ilimitado');
        const previousStock = Math.max(0, Math.trunc(Number(product.stock) || 0));
        const newStock = previousStock + addedQty;
        transaction.update(productReference, {
          stock: newStock,
          active: true,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        transaction.set(auditReference, {
          action: 'stock_replenishment',
          actionLabel: 'Reposición de stock',
          module: 'Productos',
          entityPath: `products/${productId}`,
          entityId: productId,
          description: `${String(product.name || 'Producto')}: +${addedQty} unidades (${previousStock} → ${newStock})`,
          product: { id: productId, name: String(product.name || 'Producto') },
          previousStock,
          addedQty,
          newStock,
          admin: {
            uid: user.uid || null,
            phone: user.phoneNumber || null,
            email: user.email || null
          },
          actor: {
            uid: user.uid || null,
            phone: user.phoneNumber || null,
            name: user.displayName || user.phoneNumber || user.email || 'Administrador',
            role: 'admin'
          },
          clientCreatedAt: new Date().toISOString(),
          userAgent: navigator.userAgent || null,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        result = { previousStock, newStock, name: String(product.name || 'Producto') };
      });
      notify(`${result.name}: stock actualizado de ${result.previousStock} a ${result.newStock}`, 'success');
      getModal('stockReplenishmentModal')?.hide();
    } catch (error) {
      console.error('Reposición de stock:', error);
      notify(`No se pudo reponer el stock: ${error.message}`, 'danger');
    } finally {
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
  }

  function hexToRgb(hex) {
    const clean = String(hex || '#f97316').replace('#', '');
    const value = clean.length === 3 ? clean.split('').map(char => char + char).join('') : clean.padEnd(6, '0').slice(0, 6);
    return [parseInt(value.slice(0, 2), 16) || 249, parseInt(value.slice(2, 4), 16) || 115, parseInt(value.slice(4, 6), 16) || 22];
  }

  function imageToDataUrl(source, maxWidth = 480, maxHeight = 480) {
    if (!source) return Promise.resolve(null);
    return new Promise(resolve => {
      const image = new Image();
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(value);
      };
      const timeoutId = window.setTimeout(() => finish(null), 8000);
      image.crossOrigin = 'anonymous';
      image.referrerPolicy = 'no-referrer';
      image.decoding = 'async';
      image.onload = () => {
        try {
          const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight, 1);
          const width = Math.max(1, Math.round(image.naturalWidth * scale));
          const height = Math.max(1, Math.round(image.naturalHeight * scale));
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext('2d');
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, width, height);
          context.drawImage(image, 0, 0, width, height);
          finish(canvas.toDataURL('image/jpeg', 0.82));
        } catch (error) {
          console.warn('Conversión de imagen para PDF:', error);
          finish(null);
        }
      };
      image.onerror = () => finish(null);
      image.src = source;
    });
  }

  async function mapWithConcurrency(list, concurrency, mapper) {
    const result = new Array(list.length);
    let nextIndex = 0;
    async function worker() {
      while (nextIndex < list.length) {
        const index = nextIndex;
        nextIndex += 1;
        result[index] = await mapper(list[index], index);
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(list.length, 1)) }, worker));
    return result;
  }

  async function getThemeConfig() {
    try {
      const snapshot = await db.collection(COLL.config).doc('theme').get();
      return snapshot.exists ? snapshot.data() || {} : {};
    } catch (error) {
      console.warn('Tema para catálogo:', error);
      return {};
    }
  }

  async function exportCatalogPdf() {
    if (state.exportInProgress) return;
    const products = getAdminProducts();
    if (!products.length) return notify('No hay productos para exportar', 'warning');
    const button = document.getElementById('exportCatalogPdfBtn');
    const originalHtml = button.innerHTML;
    state.exportInProgress = true;
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Preparando catálogo…';

    try {
      await loadScript(JSPDF_CDN, 'jspdf');
      const JsPdf = window.jspdf?.jsPDF;
      if (!JsPdf) throw new Error('jsPDF no está disponible');
      const categories = getAdminCategories();
      const categoryNames = new Map(categories.map(category => [category.id, category.name || 'Sin categoría']));
      const theme = await getThemeConfig();
      const storeName = String(theme.storeName || document.querySelector('.logo-text')?.textContent || 'Kiosco').trim();
      const logoUrl = String(theme.storeLogoUrl || '').trim();
      const accent = hexToRgb(theme.accentColor || '#f97316');
      const logoData = await imageToDataUrl(logoUrl, 360, 360);

      button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Procesando imágenes…';
      const productImages = await mapWithConcurrency(products, 4, product => imageToDataUrl(product.resolvedImageUrl || product.imageUrl, 240, 240));
      const imageById = new Map(products.map((product, index) => [product.id, productImages[index]]));

      const doc = new JsPdf({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 12;

      doc.setFillColor(...accent);
      doc.rect(0, 0, pageWidth, 72, 'F');
      if (logoData) {
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(pageWidth / 2 - 24, 18, 48, 48, 5, 5, 'F');
        doc.addImage(logoData, 'JPEG', pageWidth / 2 - 21, 21, 42, 42, undefined, 'FAST');
      } else {
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(26);
        doc.text('K', pageWidth / 2, 47, { align: 'center' });
      }
      doc.setTextColor(33, 37, 41);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(28);
      doc.text(storeName, pageWidth / 2, 100, { align: 'center', maxWidth: pageWidth - 32 });
      doc.setTextColor(...accent);
      doc.setFontSize(17);
      doc.text('Catálogo de productos', pageWidth / 2, 114, { align: 'center' });
      doc.setTextColor(90, 90, 90);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.text(`Generado: ${new Date().toLocaleDateString('es-PE')}`, pageWidth / 2, 134, { align: 'center' });
      doc.text(`Total de productos: ${products.length}`, pageWidth / 2, 143, { align: 'center' });
      doc.setDrawColor(...accent);
      doc.setLineWidth(1);
      doc.line(55, 158, pageWidth - 55, 158);
      doc.setFontSize(9);
      doc.setTextColor(110, 110, 110);
      doc.text('Precios y disponibilidad sujetos a actualización en la tienda digital.', pageWidth / 2, 176, { align: 'center' });

      const groups = new Map();
      products.forEach(product => {
        const categoryName = categoryNames.get(product.categoryId) || 'Sin categoría';
        if (!groups.has(categoryName)) groups.set(categoryName, []);
        groups.get(categoryName).push(product);
      });
      const sortedGroups = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'));
      sortedGroups.forEach(([, list]) => list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es')));

      const columns = [
        { key: 'image', title: 'Imagen', x: margin, width: 24 },
        { key: 'name', title: 'Nombre', x: margin + 24, width: 35 },
        { key: 'description', title: 'Descripción', x: margin + 59, width: 50 },
        { key: 'category', title: 'Categoría', x: margin + 109, width: 28 },
        { key: 'price', title: 'Precio', x: margin + 137, width: 22 },
        { key: 'stock', title: 'Stock', x: margin + 159, width: 15 }
      ];
      let y = 18;

      function addContentPage() {
        doc.addPage();
        y = 16;
      }

      function drawTableHeader() {
        doc.setFillColor(40, 40, 44);
        doc.rect(margin, y, pageWidth - margin * 2, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        columns.forEach(column => doc.text(column.title, column.x + 1, y + 5));
        doc.setTextColor(35, 35, 35);
        y += 10;
      }

      addContentPage();
      for (const [categoryName, groupProducts] of sortedGroups) {
        if (y > pageHeight - 35) addContentPage();
        doc.setFillColor(...accent);
        doc.roundedRect(margin, y, pageWidth - margin * 2, 9, 2, 2, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(`${categoryName} (${groupProducts.length})`, margin + 3, y + 6);
        y += 11;
        drawTableHeader();

        for (const product of groupProducts) {
          const values = {
            name: String(product.name || 'Sin nombre'),
            description: String(product.description || 'Sin descripción'),
            category: categoryName,
            price: formatMoney(product.price),
            stock: product.stock === null || product.stock === undefined || product.stock === '' ? 'Ilimitado' : String(Math.max(0, Number(product.stock) || 0))
          };
          const wrapped = {
            name: doc.splitTextToSize(values.name, columns[1].width - 2),
            description: doc.splitTextToSize(values.description, columns[2].width - 2),
            category: doc.splitTextToSize(values.category, columns[3].width - 2),
            price: doc.splitTextToSize(values.price, columns[4].width - 2),
            stock: doc.splitTextToSize(values.stock, columns[5].width - 2)
          };
          const textHeight = Math.max(...Object.values(wrapped).map(lines => lines.length * 3.4 + 4));
          const rowHeight = Math.max(22, textHeight);
          if (y + rowHeight > pageHeight - 18) {
            addContentPage();
            drawTableHeader();
          }

          doc.setDrawColor(210, 210, 210);
          doc.rect(margin, y, pageWidth - margin * 2, rowHeight);
          columns.slice(1).forEach(column => doc.line(column.x, y, column.x, y + rowHeight));
          const imageData = imageById.get(product.id);
          if (imageData) {
            const size = Math.min(18, rowHeight - 4);
            doc.addImage(imageData, 'JPEG', columns[0].x + 3, y + 2, size, size, undefined, 'FAST');
          } else {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.5);
            doc.setTextColor(130, 130, 130);
            doc.text('Sin imagen', columns[0].x + columns[0].width / 2, y + rowHeight / 2, { align: 'center' });
          }
          doc.setTextColor(40, 40, 40);
          doc.setFontSize(7.3);
          doc.setFont('helvetica', 'bold');
          doc.text(wrapped.name, columns[1].x + 1, y + 4);
          doc.setFont('helvetica', 'normal');
          doc.text(wrapped.description, columns[2].x + 1, y + 4);
          doc.text(wrapped.category, columns[3].x + 1, y + 4);
          doc.text(wrapped.price, columns[4].x + 1, y + 4);
          doc.text(wrapped.stock, columns[5].x + 1, y + 4);
          y += rowHeight;
        }
        y += 5;
      }

      const pageCount = doc.getNumberOfPages();
      for (let page = 1; page <= pageCount; page += 1) {
        doc.setPage(page);
        doc.setDrawColor(...accent);
        doc.setLineWidth(0.35);
        doc.line(margin, pageHeight - 11, pageWidth - margin, pageHeight - 11);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 100, 100);
        doc.text(storeName, margin, pageHeight - 6);
        doc.text(`Página ${page} de ${pageCount}`, pageWidth - margin, pageHeight - 6, { align: 'right' });
      }

      const date = localDateInput();
      doc.save(`catalogo-${date}.pdf`);
      notify('Catálogo PDF generado', 'success');
    } catch (error) {
      console.error('Catálogo PDF:', error);
      notify(`No se pudo generar el catálogo: ${error.message}`, 'danger');
    } finally {
      state.exportInProgress = false;
      button.disabled = false;
      button.innerHTML = originalHtml;
    }
  }

  function resetImportModal() {
    state.importRows = [];
    state.importFileName = '';
    state.importInProgress = false;
    const fileInput = document.getElementById('productsExcelFile');
    if (fileInput) fileInput.value = '';
    document.getElementById('productsImportRowCount').textContent = '0 filas';
    document.getElementById('productsImportPreview').innerHTML = '<tr><td colspan="6" class="text-center text-body-secondary py-5">Selecciona un archivo para ver los primeros 5 registros.</td></tr>';
    document.getElementById('runProductsImportBtn').disabled = true;
    document.getElementById('runProductsImportBtn').innerHTML = '<i class="bi bi-cloud-arrow-up me-2"></i>Importar 0 productos';
    document.getElementById('productsImportProgressWrap').classList.add('d-none');
    document.getElementById('productsImportResult').classList.add('d-none');
    document.getElementById('productsImportResult').innerHTML = '';
  }

  async function downloadProductsTemplate() {
    try {
      const XLSX = await ensureXlsx();
      const categories = getAdminCategories();
      const main = categories.find(category => !category.parentId);
      const sub = categories.find(category => category.parentId === main?.id) || categories.find(category => category.parentId);
      const rows = [
        {
          nombre: 'Producto de ejemplo',
          descripcion: 'Descripción completa del producto',
          precio: 9.9,
          stock: 25,
          categoria: main?.name || 'Nombre de categoría existente',
          subcategoria: sub?.name || '',
          imageUrl: 'https://ejemplo.com/imagen.jpg',
          activo: 'SI'
        },
        {
          nombre: 'Producto con stock ilimitado',
          descripcion: '',
          precio: 5.5,
          stock: '',
          categoria: main?.name || '',
          subcategoria: '',
          imageUrl: '',
          activo: 'SI'
        }
      ];
      const sheet = XLSX.utils.json_to_sheet(rows, { header: ['nombre', 'descripcion', 'precio', 'stock', 'categoria', 'subcategoria', 'imageUrl', 'activo'] });
      sheet['!cols'] = [{ wch: 30 }, { wch: 45 }, { wch: 12 }, { wch: 12 }, { wch: 24 }, { wch: 24 }, { wch: 45 }, { wch: 10 }];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, 'Productos');
      XLSX.writeFile(workbook, 'plantilla-importacion-productos.xlsx', { compression: true });
      notify('Plantilla descargada', 'success');
    } catch (error) {
      console.error('Plantilla Excel:', error);
      notify(`No se pudo generar la plantilla: ${error.message}`, 'danger');
    }
  }

  function canonicalImportRow(raw, rowNumber) {
    const headers = new Map(Object.keys(raw || {}).map(key => [normalizeName(key), key]));
    const read = name => raw?.[headers.get(normalizeName(name))] ?? '';
    return {
      rowNumber,
      nombre: read('nombre'),
      descripcion: read('descripcion'),
      precio: read('precio'),
      stock: read('stock'),
      categoria: read('categoria'),
      subcategoria: read('subcategoria'),
      imageUrl: read('imageUrl'),
      activo: read('activo')
    };
  }

  function renderImportPreview() {
    const body = document.getElementById('productsImportPreview');
    const count = state.importRows.length;
    document.getElementById('productsImportRowCount').textContent = `${count} ${count === 1 ? 'fila' : 'filas'}`;
    document.getElementById('runProductsImportBtn').disabled = count === 0;
    document.getElementById('runProductsImportBtn').innerHTML = `<i class="bi bi-cloud-arrow-up me-2"></i>Importar ${count} productos`;
    if (!count) {
      body.innerHTML = '<tr><td colspan="6" class="text-center text-body-secondary py-5">El archivo no contiene filas de productos.</td></tr>';
      return;
    }
    body.innerHTML = state.importRows.slice(0, 5).map(row => `
      <tr>
        <td>${row.rowNumber}</td>
        <td>${escapeHtml(row.nombre)}</td>
        <td>${escapeHtml(row.precio)}</td>
        <td>${row.stock === '' || row.stock == null ? '<span class="text-body-secondary">Ilimitado</span>' : escapeHtml(row.stock)}</td>
        <td>${escapeHtml(row.categoria || '—')}</td>
        <td>${escapeHtml(row.activo || 'SI')}</td>
      </tr>`).join('');
  }

  async function readProductsExcel(file) {
    if (!file) return;
    if (!/\.(xlsx|xls)$/i.test(file.name)) return notify('Selecciona un archivo .xlsx o .xls', 'warning');
    try {
      const XLSX = await ensureXlsx();
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array', cellDates: false });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!firstSheet) throw new Error('El archivo no contiene hojas');
      const rawRows = XLSX.utils.sheet_to_json(firstSheet, { defval: '', raw: true });
      state.importRows = rawRows
        .map((raw, index) => canonicalImportRow(raw, index + 2))
        .filter(row => Object.entries(row).some(([key, value]) => key !== 'rowNumber' && String(value ?? '').trim() !== ''));
      state.importFileName = file.name;
      document.getElementById('productsImportResult').classList.add('d-none');
      renderImportPreview();
    } catch (error) {
      console.error('Lectura Excel:', error);
      state.importRows = [];
      renderImportPreview();
      notify(`No se pudo leer el archivo: ${error.message}`, 'danger');
    }
  }

  function parseDecimal(value) {
    if (typeof value === 'number') return value;
    const normalized = String(value ?? '').trim().replace(/\s/g, '').replace(',', '.');
    return normalized === '' ? NaN : Number(normalized);
  }

  function validateImportRow(row) {
    const errors = [];
    const name = String(row.nombre ?? '').trim();
    const description = String(row.descripcion ?? '').trim();
    const price = parseDecimal(row.precio);
    const stockRaw = String(row.stock ?? '').trim();
    const stockNumber = stockRaw === '' ? null : Number(stockRaw);
    const categoryName = String(row.categoria ?? '').trim();
    const subcategoryName = String(row.subcategoria ?? '').trim();
    const imageUrl = String(row.imageUrl ?? '').trim();
    const activeRaw = normalizeName(row.activo || 'SI');

    if (!name) errors.push('nombre requerido');
    if (!Number.isFinite(price) || price < 0) errors.push('precio inválido');
    if (stockNumber !== null && (!Number.isInteger(stockNumber) || stockNumber < 0)) errors.push('stock debe ser un entero mayor o igual a 0, o quedar vacío');
    if (imageUrl) {
      try {
        const url = new URL(imageUrl);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol');
      } catch (error) {
        errors.push('imageUrl inválida');
      }
    }

    let active = true;
    if (['si', 'sí', 'yes', 'true', '1'].includes(activeRaw)) active = true;
    else if (['no', 'false', '0'].includes(activeRaw)) active = false;
    else errors.push('activo debe ser SI o NO');

    const categories = getAdminCategories();
    const mainCategories = categories.filter(category => !category.parentId);
    const category = categoryName
      ? mainCategories.find(item => normalizeName(item.name) === normalizeName(categoryName))
      : null;
    if (categoryName && !category) errors.push(`categoría “${categoryName}” no existe`);

    let subcategory = null;
    if (subcategoryName) {
      subcategory = categories.find(item => item.parentId && normalizeName(item.name) === normalizeName(subcategoryName)
        && (!category || item.parentId === category.id));
      if (!subcategory) errors.push(`subcategoría “${subcategoryName}” no existe${category ? ` dentro de ${category.name}` : ''}`);
    }

    const categoryId = category?.id || (subcategory?.parentId || null);
    if (errors.length) return { valid: false, errors };
    return {
      valid: true,
      payload: {
        name,
        description,
        price: Number(price.toFixed(2)),
        stock: stockNumber,
        categoryId,
        subcategoryId: subcategory?.id || null,
        imageUrl: imageUrl || null,
        active,
        unit: 'Unidad',
        discountPercent: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }
    };
  }

  function updateImportProgress(done, total) {
    const percent = total ? Math.round((done / total) * 100) : 0;
    document.getElementById('productsImportProgressWrap').classList.remove('d-none');
    document.getElementById('productsImportProgressText').textContent = `Procesando ${done} de ${total} filas…`;
    document.getElementById('productsImportProgressPercent').textContent = `${percent}%`;
    document.getElementById('productsImportProgressBar').style.width = `${percent}%`;
  }

  function renderImportResult(imported, errors) {
    const result = document.getElementById('productsImportResult');
    result.className = `mt-4 alert ${errors.length ? 'alert-warning' : 'alert-success'}`;
    result.innerHTML = `
      <div class="fw-bold mb-2">${imported} productos importados, ${errors.length} errores</div>
      ${errors.length ? `<details><summary class="small fw-semibold">Ver detalle de errores</summary><ul class="small mb-0 mt-2">${errors.map(error => `<li>Fila ${error.row}: ${escapeHtml(error.reason)}</li>`).join('')}</ul></details>` : '<div class="small">La importación finalizó correctamente.</div>'}`;
  }

  async function runProductsImport() {
    if (state.importInProgress || !state.importRows.length) return;
    if (!window.auth?.currentUser) return notify('Debes iniciar sesión como administrador', 'warning');
    state.importInProgress = true;
    const button = document.getElementById('runProductsImportBtn');
    const closeButton = document.getElementById('closeProductsImportBtn');
    button.disabled = true;
    closeButton.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Importando…';
    document.getElementById('productsImportResult').classList.add('d-none');

    let imported = 0;
    let processed = 0;
    const errors = [];
    const validRows = [];
    state.importRows.forEach(row => {
      const validation = validateImportRow(row);
      if (!validation.valid) {
        errors.push({ row: row.rowNumber, reason: validation.errors.join('; ') });
        processed += 1;
      } else {
        validRows.push({ row, payload: validation.payload });
      }
    });
    updateImportProgress(processed, state.importRows.length);

    try {
      for (let start = 0; start < validRows.length; start += BATCH_SIZE) {
        const batch = validRows.slice(start, start + BATCH_SIZE);
        const results = await Promise.all(batch.map(async entry => {
          try {
            await db.collection(COLL.products).add(entry.payload);
            return { ok: true, row: entry.row.rowNumber };
          } catch (error) {
            return { ok: false, row: entry.row.rowNumber, reason: error.message };
          }
        }));
        results.forEach(result => {
          processed += 1;
          if (result.ok) imported += 1;
          else errors.push({ row: result.row, reason: result.reason });
        });
        updateImportProgress(processed, state.importRows.length);
        await new Promise(resolve => window.setTimeout(resolve, 0));
      }
      renderImportResult(imported, errors.sort((a, b) => a.row - b.row));
      notify(`${imported} productos importados`, errors.length ? 'warning' : 'success');
    } catch (error) {
      console.error('Importación de productos:', error);
      errors.push({ row: 'general', reason: error.message });
      renderImportResult(imported, errors);
      notify(`La importación se interrumpió: ${error.message}`, 'danger');
    } finally {
      state.importInProgress = false;
      button.disabled = false;
      closeButton.disabled = false;
      button.innerHTML = `<i class="bi bi-cloud-arrow-up me-2"></i>Importar ${state.importRows.length} productos`;
    }
  }

  function bindEvents() {
    document.getElementById('addExpenseBtn')?.addEventListener('click', () => openExpenseModal());
    document.getElementById('exportExpensesBtn')?.addEventListener('click', exportExpenses);
    document.getElementById('expenseMonthFilter')?.addEventListener('change', renderExpenses);
    document.getElementById('expenseForm')?.addEventListener('submit', saveExpense);
    document.getElementById('stockReplenishmentForm')?.addEventListener('submit', saveStockReplenishment);
    document.getElementById('importProductsExcelBtn')?.addEventListener('click', () => {
      resetImportModal();
      getModal('productsExcelImportModal')?.show();
    });
    document.getElementById('exportCatalogPdfBtn')?.addEventListener('click', exportCatalogPdf);
    document.getElementById('downloadProductsTemplateBtn')?.addEventListener('click', downloadProductsTemplate);
    document.getElementById('productsExcelFile')?.addEventListener('change', event => readProductsExcel(event.target.files?.[0]));
    document.getElementById('runProductsImportBtn')?.addEventListener('click', runProductsImport);

    document.addEventListener('click', event => {
      const expenseNavigation = event.target.closest('[data-admin-section="expenses"]');
      if (expenseNavigation) {
        openExpensesSection(event);
        return;
      }
      const editButton = event.target.closest('[data-edit-expense]');
      if (editButton) {
        openExpenseModal(editButton.dataset.editExpense);
        return;
      }
      const deleteButton = event.target.closest('[data-delete-expense]');
      if (deleteButton) {
        void deleteExpense(deleteButton.dataset.deleteExpense);
        return;
      }
      const replenishButton = event.target.closest('[data-replenish-product]');
      if (replenishButton) {
        openReplenishmentModal(replenishButton.dataset.replenishProduct);
        return;
      }
      const qrButton = event.target.closest('[data-admin-product-qr]');
      if (qrButton) {
        const product = getAdminProducts().find(item => item.id === qrButton.dataset.adminProductQr);
        if (product) window.KioscoProductExperience?.openProductQr?.(product);
      }
    });

    window.addEventListener('admin:products-updated', event => {
      state.adminProducts = Array.isArray(event.detail?.products) ? event.detail.products : [];
      decorateAdminProductCards();
    });
    window.addEventListener('admin:categories-updated', event => {
      state.adminCategories = Array.isArray(event.detail?.categories) ? event.detail.categories : [];
    });
    window.addEventListener('dashboard:data-updated', event => {
      state.dashboardOrders = Array.isArray(event.detail?.orders) ? event.detail.orders : state.dashboardOrders;
      state.dashboardPeriod = event.detail?.period || state.dashboardPeriod;
      renderDashboardFinancials();
    });
    window.addEventListener('dashboard:period-changed', event => {
      state.dashboardPeriod = event.detail?.period || 'day';
      renderDashboardFinancials();
    });
    window.addEventListener('kiosco:themechange', () => {
      renderExpenses();
      renderDashboardFinancials();
    });

    window.auth?.onAuthStateChanged?.(user => {
      if (user) subscribeExpenses();
      else unsubscribeExpenses();
    });
  }

  function bootstrapData() {
    state.adminProducts = getAdminApi()?.getProducts?.() || [];
    state.adminCategories = getAdminApi()?.getCategories?.() || [];
    state.dashboardOrders = window.Dashboard?.getOrders?.() || [];
    state.dashboardPeriod = window.Dashboard?.getPeriod?.() || 'day';
    observeAdminProductGrid();
    if (window.auth?.currentUser) subscribeExpenses();
    renderExpenses();
    renderDashboardFinancials();
  }

  mountUi();
  bindEvents();
  bootstrapData();

  window.KioscoAdminOperations = Object.freeze({
    version: VERSION,
    renderExpenses,
    exportExpenses,
    exportCatalogPdf,
    openExpenseModal,
    openReplenishmentModal,
    decorateAdminProductCards,
    getExpenses: () => state.expenses.map(expense => ({ ...expense }))
  });
})();

// ===== Funcionalidad integrada: dashboard heatmap =====
'use strict';

(function initializeKioscoDashboardHeatmap() {
  const VERSION = '1.0.1';
  const CHART_CDN = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';

  if (window.KioscoDashboardHeatmap?.version) return;

  const state = {
    orders: [],
    period: 'day',
    calendarDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    hourlyChart: null,
    heatmapVisible: false,
    tooltips: []
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function toDate(value) {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatMoney(value) {
    const currency = window.APP_CONFIG?.currency || 'S/';
    return `${currency} ${Number(value || 0).toFixed(2)}`;
  }

  function loadChartLibrary() {
    if (window.Chart) return Promise.resolve(window.Chart);
    return new Promise((resolve, reject) => {
      const existing = [...document.scripts].find(script => script.src === CHART_CDN);
      if (existing) {
        existing.addEventListener('load', () => resolve(window.Chart), { once: true });
        existing.addEventListener('error', () => reject(new Error('No se pudo cargar Chart.js')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = CHART_CDN;
      script.async = true;
      script.addEventListener('load', () => resolve(window.Chart), { once: true });
      script.addEventListener('error', () => reject(new Error('No se pudo cargar Chart.js')), { once: true });
      document.head.appendChild(script);
    });
  }

  function mountHeatmap() {
    if (document.getElementById('dashboardHeatmapPane')) return;
    const section = document.getElementById('sec-dashboard');
    if (!section) return;
    const toolbar = section.firstElementChild;
    const periodGroup = toolbar?.querySelector('.btn-group');
    if (!toolbar || !periodGroup) return;

    const mapButton = document.createElement('button');
    mapButton.type = 'button';
    mapButton.className = 'btn btn-outline-secondary btn-sm';
    mapButton.id = 'dashboardHeatmapTab';
    mapButton.innerHTML = '<i class="bi bi-grid-3x3-gap me-1"></i>Mapa de calor';
    periodGroup.appendChild(mapButton);

    const standardView = document.createElement('div');
    standardView.id = 'dashboardStandardView';
    let node = toolbar.nextSibling;
    while (node) {
      const nextNode = node.nextSibling;
      standardView.appendChild(node);
      node = nextNode;
    }
    section.appendChild(standardView);

    const heatmapPane = document.createElement('div');
    heatmapPane.id = 'dashboardHeatmapPane';
    heatmapPane.className = 'd-none';
    heatmapPane.innerHTML = `
      <div class="row g-4">
        <div class="col-xl-7">
          <div class="card h-100">
            <div class="card-header d-flex align-items-center justify-content-between gap-2 flex-wrap">
              <div class="fw-semibold"><i class="bi bi-calendar3 me-2"></i>Calendario mensual de pedidos</div>
              <div class="d-flex align-items-center gap-2">
                <button type="button" class="btn btn-outline-secondary btn-sm" id="heatmapPreviousMonth" aria-label="Mes anterior"><i class="bi bi-chevron-left"></i></button>
                <span class="fw-semibold text-center kiosco-heatmap-month-label" id="heatmapMonthLabel"></span>
                <button type="button" class="btn btn-outline-secondary btn-sm" id="heatmapNextMonth" aria-label="Mes siguiente"><i class="bi bi-chevron-right"></i></button>
              </div>
            </div>
            <div class="card-body">
              <div class="kiosco-heatmap-legend d-flex gap-3 flex-wrap small mb-3">
                <span><i class="kiosco-heat-swatch kiosco-heat-0"></i>Sin pedidos</span>
                <span><i class="kiosco-heat-swatch kiosco-heat-1"></i>1–3</span>
                <span><i class="kiosco-heat-swatch kiosco-heat-2"></i>4–7</span>
                <span><i class="kiosco-heat-swatch kiosco-heat-3"></i>8 o más</span>
              </div>
              <div class="kiosco-heatmap-calendar" id="heatmapCalendar" aria-label="Mapa de calor mensual"></div>
            </div>
          </div>
        </div>
        <div class="col-xl-5">
          <div class="card h-100">
            <div class="card-header">
              <div class="fw-semibold"><i class="bi bi-clock-history me-2"></i>Pedidos por hora</div>
              <div class="small text-body-secondary mt-1" id="heatmapPeriodLabel">Período: Hoy</div>
            </div>
            <div class="card-body kiosco-hourly-chart-wrap"><canvas id="ordersByHourChart"></canvas></div>
          </div>
        </div>
      </div>`;
    section.appendChild(heatmapPane);
  }

  function periodLabel(period) {
    return { day: 'Hoy', week: 'Semana actual', month: 'Mes actual' }[period] || 'Hoy';
  }

  function showHeatmap() {
    state.heatmapVisible = true;
    document.getElementById('dashboardStandardView')?.classList.add('d-none');
    document.getElementById('dashboardHeatmapPane')?.classList.remove('d-none');
    const mapButton = document.getElementById('dashboardHeatmapTab');
    mapButton?.classList.remove('btn-outline-secondary');
    mapButton?.classList.add('btn-primary', 'active');
    document.querySelectorAll('[data-dash-period]').forEach(button => {
      button.classList.remove('btn-primary', 'active');
      button.classList.add('btn-outline-secondary');
    });
    render();
  }

  function showStandardDashboard() {
    state.heatmapVisible = false;
    document.getElementById('dashboardStandardView')?.classList.remove('d-none');
    document.getElementById('dashboardHeatmapPane')?.classList.add('d-none');
    const mapButton = document.getElementById('dashboardHeatmapTab');
    mapButton?.classList.remove('btn-primary', 'active');
    mapButton?.classList.add('btn-outline-secondary');
  }

  function monthOrders() {
    const year = state.calendarDate.getFullYear();
    const month = state.calendarDate.getMonth();
    return state.orders.filter(order => {
      const date = toDate(order.createdAt);
      return date && date.getFullYear() === year && date.getMonth() === month;
    });
  }

  function heatClass(count) {
    if (count === 0) return 'kiosco-heat-0';
    if (count <= 3) return 'kiosco-heat-1';
    if (count <= 7) return 'kiosco-heat-2';
    return 'kiosco-heat-3';
  }

  function disposeTooltips() {
    state.tooltips.forEach(tooltip => tooltip.dispose?.());
    state.tooltips = [];
  }

  function renderCalendar() {
    const calendar = document.getElementById('heatmapCalendar');
    const label = document.getElementById('heatmapMonthLabel');
    if (!calendar || !label) return;
    disposeTooltips();

    const year = state.calendarDate.getFullYear();
    const month = state.calendarDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const offset = (firstDay.getDay() + 6) % 7;
    const orders = monthOrders();
    const byDay = Array.from({ length: daysInMonth }, () => ({ count: 0, revenue: 0 }));
    orders.forEach(order => {
      const date = toDate(order.createdAt);
      if (!date) return;
      const item = byDay[date.getDate() - 1];
      item.count += 1;
      if (order.status !== 'rejected') item.revenue += Number(order.total || 0);
    });

    label.textContent = state.calendarDate.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
    const headers = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
      .map(day => `<div class="kiosco-heatmap-weekday">${day}</div>`).join('');
    const cells = [];
    for (let index = 0; index < offset; index += 1) cells.push('<div class="kiosco-heatmap-day kiosco-heatmap-day-empty" aria-hidden="true"></div>');
    for (let day = 1; day <= daysInMonth; day += 1) {
      const values = byDay[day - 1];
      const tooltip = `${values.count} ${values.count === 1 ? 'pedido' : 'pedidos'} · ${formatMoney(values.revenue)}`;
      cells.push(`<button type="button" class="kiosco-heatmap-day ${heatClass(values.count)}" data-bs-toggle="tooltip" data-bs-placement="top" title="${escapeHtml(tooltip)}" aria-label="Día ${day}: ${escapeHtml(tooltip)}">
        <span class="kiosco-heatmap-day-number">${day}</span>
        <span class="kiosco-heatmap-day-count">${values.count}</span>
      </button>`);
    }
    const totalCells = offset + daysInMonth;
    const trailing = (7 - (totalCells % 7)) % 7;
    for (let index = 0; index < trailing; index += 1) cells.push('<div class="kiosco-heatmap-day kiosco-heatmap-day-empty" aria-hidden="true"></div>');
    calendar.innerHTML = headers + cells.join('');

    if (window.bootstrap?.Tooltip) {
      state.tooltips = [...calendar.querySelectorAll('[data-bs-toggle="tooltip"]')]
        .map(element => new bootstrap.Tooltip(element, { container: 'body' }));
    }
  }

  function getPeriodRange(period, baseDate = new Date()) {
    if (window.Dashboard?.getPeriodRange) return window.Dashboard.getPeriodRange(period, baseDate);
    const start = new Date(baseDate);
    const end = new Date(baseDate);
    if (period === 'day') {
      start.setHours(0, 0, 0, 0);
      end.setTime(start.getTime());
      end.setDate(end.getDate() + 1);
      return { start, end };
    }
    if (period === 'week') {
      const day = start.getDay();
      start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
      start.setHours(0, 0, 0, 0);
      end.setTime(start.getTime());
      end.setDate(end.getDate() + 7);
      return { start, end };
    }
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setTime(start.getTime());
    end.setMonth(end.getMonth() + 1);
    return { start, end };
  }

  function ordersForPeriod() {
    const { start, end } = getPeriodRange(state.period);
    return state.orders.filter(order => {
      const date = toDate(order.createdAt);
      return date && date >= start && date < end;
    });
  }

  async function renderHourlyChart() {
    const canvas = document.getElementById('ordersByHourChart');
    const periodElement = document.getElementById('heatmapPeriodLabel');
    if (!canvas) return;
    if (periodElement) periodElement.textContent = `Período: ${periodLabel(state.period)}`;

    try {
      await loadChartLibrary();
    } catch (error) {
      console.warn('Chart.js para mapa de calor:', error);
      return;
    }

    const counts = Array.from({ length: 24 }, () => 0);
    ordersForPeriod().forEach(order => {
      const date = toDate(order.createdAt);
      if (date) counts[date.getHours()] += 1;
    });
    const styles = getComputedStyle(document.documentElement);
    const accent = styles.getPropertyValue('--accent').trim() || '#f97316';
    const textColor = styles.getPropertyValue('--bs-body-color').trim() || '#6c757d';
    const borderColor = styles.getPropertyValue('--bs-border-color').trim() || 'rgba(127,127,127,.2)';

    state.hourlyChart?.destroy();
    state.hourlyChart = new window.Chart(canvas, {
      type: 'bar',
      data: {
        labels: counts.map((_, hour) => `${String(hour).padStart(2, '0')}:00`),
        datasets: [{ label: 'Pedidos', data: counts, backgroundColor: accent, borderRadius: 5, maxBarThickness: 20 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: context => `${context.parsed.y} ${context.parsed.y === 1 ? 'pedido' : 'pedidos'}` } }
        },
        scales: {
          x: { ticks: { color: textColor, maxRotation: 90, minRotation: 45 }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: textColor, precision: 0 }, grid: { color: borderColor } }
        }
      }
    });
  }

  function render() {
    renderCalendar();
    void renderHourlyChart();
  }

  function changeCalendarMonth(delta) {
    state.calendarDate = new Date(state.calendarDate.getFullYear(), state.calendarDate.getMonth() + delta, 1);
    renderCalendar();
  }

  function bindEvents() {
    document.getElementById('dashboardHeatmapTab')?.addEventListener('click', showHeatmap);
    document.querySelectorAll('[data-dash-period]').forEach(button => {
      button.addEventListener('click', () => {
        state.period = button.dataset.dashPeriod || 'day';
        showStandardDashboard();
      });
    });
    document.getElementById('heatmapPreviousMonth')?.addEventListener('click', () => changeCalendarMonth(-1));
    document.getElementById('heatmapNextMonth')?.addEventListener('click', () => changeCalendarMonth(1));

    window.addEventListener('dashboard:data-updated', event => {
      state.orders = Array.isArray(event.detail?.orders) ? event.detail.orders : state.orders;
      state.period = event.detail?.period || state.period;
      if (state.heatmapVisible) render();
    });
    window.addEventListener('dashboard:period-changed', event => {
      state.period = event.detail?.period || 'day';
      if (state.heatmapVisible) void renderHourlyChart();
    });
    window.addEventListener('kiosco:themechange', () => {
      if (state.heatmapVisible) render();
    });
  }

  function bootstrapData() {
    state.orders = window.Dashboard?.getOrders?.() || [];
    state.period = window.Dashboard?.getPeriod?.() || 'day';
    renderCalendar();
  }

  mountHeatmap();
  bindEvents();
  bootstrapData();

  window.KioscoDashboardHeatmap = Object.freeze({
    version: VERSION,
    show: showHeatmap,
    hide: showStandardDashboard,
    render,
    getOrders: () => state.orders.map(order => ({ ...order }))
  });
})();

// ===== Funcionalidad integrada: system =====
'use strict';

(() => {
  if (window.__KIOSCO_FIRESTORE_IMAGES_ACTIVE || window.__KIOSCO_FIRESTORE_IMAGES_LOADING) return;
  window.__KIOSCO_FIRESTORE_IMAGES_LOADING = true;
  const script = document.createElement('script');
  script.async = false;
  script.dataset.kioscoFirestoreImages = 'true';
  script.addEventListener('error', () => {
    window.__KIOSCO_FIRESTORE_IMAGES_LOADING = false;
    console.error('No se pudo cargar el módulo Firestore de imágenes.');
  });
  document.body.append(script);
})();

// ===== Funcionalidad integrada: firestore images =====
'use strict';

(() => {
  if (window.__KIOSCO_FIRESTORE_IMAGES_ACTIVE) return;
  window.__KIOSCO_FIRESTORE_IMAGES_ACTIVE = true;
  window.__KIOSCO_FIRESTORE_IMAGES_LOADING = false;

  const KEYS = Object.freeze({
    view: 'kk_view_mode',
    price: 'kk_price_filter',
    sort: 'kk_sort_mode',
    accessible: 'kk_accessible',
    vibration: 'kk_vibration',
    productsCache: 'kk_prods_cache',
    categoriesCache: 'kk_cats_cache',
    variantCart: 'kk_cart_variants',
    mediaConfig: 'kk_media_config'
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
    removeProductImageRequested: false,
    imagePreviewTimer: null,
    imagePreviewUrl: null,
    selectedLogoFile: null,
    logoPreviewUrl: null,
    mediaConfig: { provider: 'firestore' },
    offer: null,
    offerTimer: null,
    featured: null,
    maintenance: null,
    variantProduct: null,
    variantCart: readJson(KEYS.variantCart, {}),
    checkoutBusy: false,
    access: { mainAdmin: false, member: null, permissions: null },
    accessReady: false,
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

  async function sha256Hex(value) {
    if (!window.crypto?.subtle || typeof TextEncoder === 'undefined') return '';
    const data = new TextEncoder().encode(String(value || ''));
    const hash = await window.crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async function blockedClientDocId(phone) {
    const normalized = normalizePhone(phone);
    const digest = await sha256Hex(`kiosco:${normalized}`);
    return digest ? `h_${digest}` : `p_${normalized}`;
  }

  async function isBlockedClient(phone) {
    const normalized = normalizePhone(phone);
    if (!normalized || !window.db) return false;
    const hashedId = await blockedClientDocId(normalized);
    const ids = [...new Set([hashedId, `p_${normalized}`])];
    for (const id of ids) {
      try {
        const doc = await db.collection('blocked_clients').doc(id).get();
        if (doc.exists) return true;
      } catch (error) {
        if (error?.code !== 'permission-denied') console.warn('Verificación de cliente bloqueado:', error?.message || error);
      }
    }
    return false;
  }

  function debounce(fn, delay = 120) {
    let timer = null;
    return (...args) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fn(...args), delay);
    };
  }

  const SENSITIVE_QUERY_KEYS = new Set([
    'phone', 'telefono', 'telephone', 'mobile', 'user', 'usuario', 'admin', 'role', 'rol',
    'email', 'token', 'idtoken', 'accesstoken', 'refreshtoken', 'jwt', 'auth', 'authorization',
    'password', 'passwd', 'secret', 'apikey', 'uid', 'customerphone', 'clientphone'
  ]);

  function normalizedQueryKey(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function sanitizeUrlForPrivacy(value, base = window.location.href) {
    try {
      const url = new URL(value, base);
      if (url.origin !== window.location.origin) return url.href;
      [...url.searchParams.keys()].forEach(key => {
        if (SENSITIVE_QUERY_KEYS.has(normalizedQueryKey(key))) url.searchParams.delete(key);
      });
      return `${url.pathname}${url.search}${url.hash}`;
    } catch (error) {
      return value;
    }
  }

  function hardenUrlPrivacy() {
    try {
      const clean = sanitizeUrlForPrivacy(window.location.href);
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (clean && clean !== current) window.history.replaceState(window.history.state, document.title, clean);
    } catch (error) {
      console.warn('Privacidad de URL:', error);
    }

    let referrer = document.querySelector('meta[name="referrer"]');
    if (!referrer) {
      referrer = document.createElement('meta');
      referrer.name = 'referrer';
      document.head.append(referrer);
    }
    referrer.content = 'no-referrer';

    if (!window.history.__kkPrivacyPatched) {
      const originalPushState = window.history.pushState.bind(window.history);
      const originalReplaceState = window.history.replaceState.bind(window.history);
      window.history.pushState = (stateValue, title, url) => originalPushState(stateValue, title, url == null ? url : sanitizeUrlForPrivacy(url));
      window.history.replaceState = (stateValue, title, url) => originalReplaceState(stateValue, title, url == null ? url : sanitizeUrlForPrivacy(url));
      try { Object.defineProperty(window.history, '__kkPrivacyPatched', { value: true, configurable: false }); } catch (error) { /* no-op */ }
    }

    document.addEventListener('click', event => {
      const anchor = event.target?.closest?.('a[href]');
      if (!anchor) return;
      const rawHref = String(anchor.getAttribute('href') || '').trim();
      if (!rawHref || rawHref.startsWith('#') || rawHref.toLowerCase().startsWith('javascript:')) return;
      try {
        const target = new URL(anchor.href, window.location.href);
        if (target.origin === window.location.origin) {
          const cleanHref = sanitizeUrlForPrivacy(target.href);
          if (cleanHref) anchor.setAttribute('href', cleanHref);
        } else {
          anchor.rel = [anchor.rel, 'noopener', 'noreferrer'].filter(Boolean).join(' ');
          anchor.referrerPolicy = 'no-referrer';
        }
      } catch (error) {
        // Enlaces no HTTP se dejan intactos.
      }
    }, true);
  }

  function normalizeMediaConfig() {
    return { provider: 'firestore' };
  }

  function staticMediaConfig() {
    return { provider: 'firestore' };
  }

  function currentMediaConfig() {
    return { provider: 'firestore' };
  }

  async function loadMediaConfig() {
    state.mediaConfig = { provider: 'firestore' };
    return state.mediaConfig;
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
      appearance: 'appearance',
      media: 'appearance'
    };
    const key = map[section] || section;
    const value = p[key];
    if (typeof value === 'boolean') return value;
    if (value && typeof value === 'object') return Boolean(value[action] ?? value.view);
    return false;
  }

  async function resolveAdministrativeAccess(user) {
    if (!user) {
      state.access = { mainAdmin: false, member: null, permissions: null };
      state.accessReady = true;
      return false;
    }
    if (!window.db || !window.COLL) {
      state.accessReady = false;
      return false;
    }
    const phone = getFirebasePhone(user);
    if (!phone) {
      state.access = { mainAdmin: false, member: null, permissions: null };
      state.accessReady = true;
      return false;
    }

    let adminDoc = null;
    try {
      adminDoc = await db.collection(COLL.config).doc('admin').get();
    } catch (error) {
      if (error?.code !== 'permission-denied') console.warn('Validación de administrador:', error?.message || error);
    }
    const adminPhones = adminDoc?.exists && Array.isArray(adminDoc.data().phones) ? adminDoc.data().phones : [];
    if (adminPhones.includes(phone)) {
      state.access = { mainAdmin: true, member: null, permissions: clonePermissions(fullPermissions) };
      state.accessReady = true;
      ensureStaffPhoneIndex().catch(() => {});
      loadMediaConfig().catch(() => {});
      window.setTimeout(() => {
        applyPermissionsToAdmin();
        populateMediaAdmin();
      }, 0);
      return true;
    }

    let staffDoc = null;
    try {
      staffDoc = await db.collection(COLL.config).doc('staff').get();
    } catch (error) {
      console.warn('Validación de personal:', error?.message || error);
      state.access = { mainAdmin: false, member: null, permissions: null };
      state.accessReady = true;
      return false;
    }
    const members = staffDoc?.exists && Array.isArray(staffDoc.data().members) ? staffDoc.data().members : [];
    const member = members.find(item => String(item.phone || '').trim() === phone);
    if (!member || !['employee', 'admin'].includes(String(member.role || 'employee'))) {
      state.access = { mainAdmin: false, member: null, permissions: null };
      state.accessReady = true;
      return false;
    }
    state.access = {
      mainAdmin: false,
      member: { ...member },
      permissions: member.role === 'admin' ? clonePermissions(fullPermissions) : clonePermissions(member.permissions)
    };
    state.accessReady = true;
    loadMediaConfig().catch(() => {});
    window.setTimeout(() => {
      applyPermissionsToAdmin();
      populateMediaAdmin();
    }, 0);
    return true;
  }

  function runAdminSideEffects(user) {
    loadMediaConfig()
      .then(() => window.setTimeout(() => populateMediaAdmin(), 0))
      .catch(error => console.warn('Configuración de imágenes:', error?.message || error));
    logAdminSession(user).catch(error => console.warn('Registro de sesión:', error?.message || error));
    startOrderNotifications();
    window.setTimeout(applyPermissionsToAdmin, 0);
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
            state.accessReady = true;
            runAdminSideEffects(user);
            return true;
          }
        } catch (error) {
          console.warn('Validación de administrador principal:', error);
        }

        const allowed = await resolveAdministrativeAccess(user);
        if (allowed) runAdminSideEffects(user);
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
    // Lectura facil fue retirada: restaura siempre el tamano normal y limpia la preferencia antigua.
    state.accessible = false;
    localStorage.removeItem(KEYS.accessible);
    document.documentElement.style.fontSize = '';
    document.body?.classList.remove('accessible-mode');
    document.getElementById('kkAccessibleBtn')?.remove();
  }

  function applyAccessible() {
    state.accessible = false;
    localStorage.removeItem(KEYS.accessible);
    document.documentElement.style.fontSize = '';
    document.body?.classList.remove('accessible-mode');
    document.getElementById('kkAccessibleBtn')?.remove();
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
    // Lectura facil retirada por solicitud del propietario.
    document.getElementById('kkAccessibleBtn')?.remove();
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
    patchInlineProductImages();
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
    if (type !== 'products') {
      writeJson(KEYS.categoriesCache, list);
      return;
    }
    const safeProducts = list.map(product => {
      const copy = { ...product };
      if (Array.isArray(copy.images)) copy.images = [];
      if (typeof copy.imageUrl === 'string' && copy.imageUrl.startsWith('data:image/')) copy.imageUrl = null;
      if (typeof copy.resolvedImageUrl === 'string' && copy.resolvedImageUrl.startsWith('data:image/')) copy.resolvedImageUrl = null;
      if (typeof copy.imageOriginalUrl === 'string' && copy.imageOriginalUrl.startsWith('data:image/')) copy.imageOriginalUrl = null;
      return copy;
    });
    writeJson(KEYS.productsCache, safeProducts);
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
      window.setTimeout(patchInlineProductImages, 30);
    });
    window.addEventListener('store:categories-updated', event => {
      state.categories = Array.isArray(event.detail?.categories) ? event.detail.categories : (window.Store?.getCategories?.() || []);
      cacheStoreData('categories', state.categories);
    });
    window.addEventListener('store:filter-changed', scheduleCatalogApply);
    window.addEventListener('cart:updated', () => {
      scheduleCatalogApply();
      window.setTimeout(patchInlineProductImages, 30);
    });
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
      const image = getProductDisplayImage(product);
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
    const image = getProductDisplayImage(product);
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
        if (await isBlockedClient(phone)) throw new Error('No podemos procesar tu pedido en este momento. Contáctanos para más información.');
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
                lastOrderId: orderReference.id,
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

  function getInlineProductImages(product) {
    if (!product) return [];
    const source = Array.isArray(product.images) ? product.images : [];
    const images = source.filter(value => typeof value === 'string' && /^data:image\/[a-z0-9.+-]+;base64,/i.test(value));
    const legacy = String(product.imageUrl || product.resolvedImageUrl || '').trim();
    if (!images.length && /^data:image\/[a-z0-9.+-]+;base64,/i.test(legacy)) images.push(legacy);
    return images.slice(0, 3);
  }

  function getProductDisplayImage(product) {
    return getInlineProductImages(product)[0]
      || String(product?.resolvedImageUrl || product?.imageUrl || '').trim();
  }

  function patchInlineProductImages() {
    const publicProducts = Array.isArray(state.products) ? state.products : [];
    const publicMap = new Map(publicProducts.map(product => [String(product.id), product]));

    document.querySelectorAll('#productsGrid .prod-card[data-product-id]').forEach(card => {
      const product = publicMap.get(String(card.dataset.productId || ''));
      const source = getProductDisplayImage(product);
      if (!source) return;
      const wrap = card.querySelector('.prod-img-wrap');
      if (!wrap) return;
      let image = wrap.querySelector('img.prod-img');
      if (!image) {
        wrap.querySelector('.prod-img-placeholder')?.remove();
        image = document.createElement('img');
        image.className = 'card-img-top prod-img';
        image.loading = 'lazy';
        image.decoding = 'async';
        wrap.prepend(image);
      }
      if (image.src !== source) image.src = source;
      image.alt = String(product?.name || 'Producto');
    });

    const adminProducts = window.Admin?.getProducts?.() || [];
    const adminMap = new Map(adminProducts.map(product => [String(product.id), product]));
    document.querySelectorAll('#adminProductsGrid [data-admin-product-id]').forEach(card => {
      const product = adminMap.get(String(card.dataset.adminProductId || ''));
      const source = getProductDisplayImage(product);
      if (!source) return;
      const wrap = card.querySelector('.card-img-wrap');
      if (!wrap) return;
      let image = wrap.querySelector('img');
      if (!image) {
        wrap.replaceChildren();
        image = document.createElement('img');
        image.className = 'card-img-top h-100 w-100';
        image.style.objectFit = 'cover';
        wrap.append(image);
      }
      if (image.src !== source) image.src = source;
      image.alt = String(product?.name || 'Producto');
    });

    ['cartItemsList', 'cartItemsListMobile'].forEach(id => {
      const root = document.getElementById(id);
      if (!root) return;
      root.querySelectorAll('.cart-item[data-product-id]').forEach(row => {
        const product = publicMap.get(String(row.dataset.productId || ''));
        const source = getProductDisplayImage(product);
        if (!source) return;
        let image = row.querySelector('img.cart-item-img');
        if (!image) {
          row.querySelector('.cart-item-img-ph')?.remove();
          image = document.createElement('img');
          image.className = 'cart-item-img';
          image.width = 52;
          image.height = 52;
          image.loading = 'lazy';
          row.prepend(image);
        }
        if (image.src !== source) image.src = source;
        image.alt = String(product?.name || 'Producto');
      });
    });
  }

  function ensureImageProductEnhancements() {
    const url = document.getElementById('productImageUrl');
    const file = document.getElementById('productImageFile');
    if (!url || !file) return;
    url.placeholder = 'https://';
    file.accept = 'image/jpeg,image/png,image/webp,image/gif,image/avif,image/bmp,image/svg+xml,.jpg,.jpeg,.png,.webp,.gif,.avif,.bmp,.svg';
    const fileHelp = file.parentElement?.querySelector('.form-text');
    if (fileHelp) fileHelp.textContent = 'La imagen se redimensiona y comprime con canvas y se guarda como Base64 dentro del documento del producto en Firestore. Máximo original: 5 MB.';
    if (!document.getElementById('kkProductImageUrlHelp')) {
      const help = document.createElement('div');
      help.id = 'kkProductImageUrlHelp';
      help.className = 'form-text text-muted small';
      help.textContent = 'Clic derecho en cualquier imagen → Copiar dirección de imagen → Pegar aquí';
      const urlContainer = url.closest('.input-group') || url;
      urlContainer.insertAdjacentElement('afterend', help);
    }
    const parent = file.parentElement;
    if (!document.getElementById('kkImageTools')) {
      const tools = document.createElement('div');
      tools.id = 'kkImageTools';
      tools.className = 'kk-image-tools';
      tools.innerHTML = `<div class="d-flex flex-wrap gap-2"><button type="button" id="kkPasteImageUrl" class="btn btn-outline-secondary btn-sm"><i class="bi bi-clipboard me-1"></i>Pegar desde portapapeles</button><button type="button" id="kkRemoveProductImage" class="btn btn-outline-danger btn-sm"><i class="bi bi-trash me-1"></i>Quitar imagen</button></div><div id="kkImageError" class="kk-image-error">No se pudo cargar la imagen. Verifica el URL.</div><div id="kkImageMeta" class="kk-image-meta"></div>`;
      parent?.insertAdjacentElement('afterend', tools);
      document.getElementById('kkRemoveProductImage')?.addEventListener('click', () => {
        state.selectedProductFile = null;
        state.removeProductImageRequested = true;
        const input = document.getElementById('productImageFile');
        const urlInput = document.getElementById('productImageUrl');
        if (input) input.value = '';
        if (urlInput) urlInput.value = '';
        setImageError(false);
        updateImageMeta(0, 0, 0);
        setSharedPreview(null);
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
    state.removeProductImageRequested = false;
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

  const COMMON_IMAGE_EXTENSIONS = new Set([
    'jpg', 'jpeg', 'jpe', 'png', 'webp', 'gif', 'svg', 'avif', 'bmp', 'heic', 'heif', 'tif', 'tiff', 'ico', 'jxl', 'psd', 'ai', 'eps', 'ept', 'eps3', 'jp2', 'wdp', 'jxr', 'hdp', 'tga', 'flif', 'indd', 'pdf'
  ]);

  function validateProductFile(file) {
    if (!file) throw new Error('Selecciona una imagen');
    const ext = String(file.name || '').split('.').pop()?.toLowerCase() || '';
    const mime = String(file.type || '').toLowerCase();
    if (!(mime.startsWith('image/') || COMMON_IMAGE_EXTENSIONS.has(ext))) {
      throw new Error('El archivo seleccionado no parece ser una imagen compatible.');
    }
    if (file.size <= 0) throw new Error('La imagen está vacía');
    if (file.size > 5 * 1024 * 1024) throw new Error('La imagen no debe superar 5MB');
  }

  async function validateImageSecurity(file) {
    validateProductFile(file);
    const ext = String(file.name || '').split('.').pop()?.toLowerCase() || '';
    const mime = String(file.type || '').toLowerCase();
    if (ext !== 'svg' && mime !== 'image/svg+xml') return;
    const content = await file.text();
    const unsafe = !/<svg[\s>]/i.test(content)
      || /<script[\s>]/i.test(content)
      || /<foreignObject[\s>]/i.test(content)
      || /\son[a-z]+\s*=/i.test(content)
      || /(?:href|xlink:href)\s*=\s*["']\s*javascript:/i.test(content)
      || /data\s*:\s*text\/html/i.test(content);
    if (unsafe) throw new Error('El archivo SVG contiene contenido activo no permitido.');
  }

  async function selectProductImageFile(file) {
    try {
      await validateImageSecurity(file);
    } catch (error) {
      notify(error.message, 'danger');
      return;
    }
    state.selectedProductFile = file;
    state.removeProductImageRequested = false;
    setImageError(false);
    if (state.imagePreviewUrl) URL.revokeObjectURL(state.imagePreviewUrl);
    state.imagePreviewUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => updateImageMeta(image.naturalWidth, image.naturalHeight, file.size, false);
    image.onerror = () => {
      updateImageMeta(0, 0, file.size, false);
      const meta = document.getElementById('kkImageMeta');
      if (meta) meta.textContent = `${humanBytes(file.size)} · vista previa no disponible; el navegador intentará convertir el formato al guardar`;
    };
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
    state.removeProductImageRequested = false;
    setImageError(false);
    const urlField = document.getElementById('productImageUrl');
    const storedImage = getProductDisplayImage(product);
    if (storedImage.startsWith('data:image/')) {
      if (urlField) urlField.value = '';
      setSharedPreview(storedImage);
      updateImageMeta(Number(product?.imageWidth || 0), Number(product?.imageHeight || 0), Number(product?.imageBytes || 0));
    } else {
      const currentUrl = urlField?.value || storedImage;
      if (currentUrl) previewProductUrlDebounced(currentUrl);
      else updateImageMeta(0, 0, 0);
    }
  }

  const FIRESTORE_MEDIA_COLLECTION = 'media';
  const FIRESTORE_MEDIA_TARGET_CHARS = 150000;
  const FIRESTORE_MEDIA_HARD_CHARS = 210000;

  function dataUrlApproxBytes(dataUrl) {
    const value = String(dataUrl || '');
    const comma = value.indexOf(',');
    if (comma < 0) return value.length;
    const base64 = value.slice(comma + 1);
    return Math.ceil(base64.length * 3 / 4);
  }

  function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => resolve({ image, objectUrl });
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('El navegador no pudo leer este formato. Convierte la imagen a JPG, PNG, WEBP, GIF o AVIF e inténtalo nuevamente.'));
      };
      image.src = objectUrl;
    });
  }

  async function optimizeImageForFirestore(file, kind = 'product') {
    await validateImageSecurity(file);
    const loaded = await loadImageFromFile(file);
    const image = loaded.image;
    const originalWidth = Math.max(1, image.naturalWidth || image.width || 1);
    const originalHeight = Math.max(1, image.naturalHeight || image.height || 1);
    const maxSide = kind === 'logo' ? 800 : 1000;
    const scale = Math.min(1, maxSide / Math.max(originalWidth, originalHeight));
    let width = Math.max(1, Math.round(originalWidth * scale));
    let height = Math.max(1, Math.round(originalHeight * scale));
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) {
      URL.revokeObjectURL(loaded.objectUrl);
      throw new Error('El navegador no pudo preparar la imagen.');
    }

    let quality = 0.84;
    let dataUrl = '';
    try {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        canvas.width = width;
        canvas.height = height;
        context.clearRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        dataUrl = canvas.toDataURL('image/webp', quality);
        if (!dataUrl.startsWith('data:image/')) dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (dataUrl.length <= FIRESTORE_MEDIA_TARGET_CHARS) break;
        if (quality > 0.58) quality -= 0.08;
        else {
          width = Math.max(320, Math.round(width * 0.86));
          height = Math.max(240, Math.round(height * 0.86));
        }
      }
    } finally {
      URL.revokeObjectURL(loaded.objectUrl);
    }

    if (!dataUrl || dataUrl.length > FIRESTORE_MEDIA_HARD_CHARS) {
      throw new Error('La imagen sigue siendo demasiado pesada después de optimizarla. Usa una imagen más pequeña.');
    }
    return {
      dataUrl,
      contentType: dataUrl.slice(5, dataUrl.indexOf(';')) || 'image/webp',
      width,
      height,
      bytes: dataUrlApproxBytes(dataUrl),
      originalName: String(file.name || 'imagen'),
      originalType: String(file.type || ''),
      originalBytes: Number(file.size || 0)
    };
  }

  async function uploadFirestoreImage(file, kind = 'logo', ownerId = '') {
    if (kind === 'product') throw new Error('Las imágenes de productos se guardan directamente dentro del documento del producto.');
    if (!window.db || !window.firebase?.firestore) throw new Error('Firestore no está disponible.');
    if (!window.auth?.currentUser) throw new Error('Debes iniciar sesión como administrador para subir imágenes.');
    const optimized = await optimizeImageForFirestore(file, kind);
    const reference = db.collection(FIRESTORE_MEDIA_COLLECTION).doc();
    const payload = {
      data: optimized.dataUrl,
      contentType: optimized.contentType,
      width: optimized.width,
      height: optimized.height,
      bytes: optimized.bytes,
      originalName: optimized.originalName,
      originalType: optimized.originalType || null,
      originalBytes: optimized.originalBytes,
      kind: kind === 'logo' ? 'logo' : 'product',
      ownerId: String(ownerId || ''),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      uploadedBy: getFirebasePhone() || window.auth.currentUser.uid || null
    };
    await reference.set(payload);
    return {
      mediaId: reference.id,
      imagePath: `firestore-media:${reference.id}`,
      imageUrl: optimized.dataUrl,
      originalUrl: null,
      width: optimized.width,
      height: optimized.height,
      bytes: optimized.bytes,
      format: optimized.contentType.replace('image/', ''),
      provider: 'firestore'
    };
  }

  function firestoreMediaIdFromPath(imagePath) {
    const value = String(imagePath || '').trim();
    return value.startsWith('firestore-media:') ? value.slice('firestore-media:'.length).trim() : '';
  }

  async function deleteFirestoreMediaByPath(imagePath) {
    const mediaId = firestoreMediaIdFromPath(imagePath);
    if (!mediaId || !window.db) return false;
    try {
      await db.collection(FIRESTORE_MEDIA_COLLECTION).doc(mediaId).delete();
      return true;
    } catch (error) {
      console.warn('No se pudo eliminar la imagen de Firestore:', error?.message || error);
      return false;
    }
  }

  async function detachMediaAsset(imagePath, imageUrl, targetType, targetId, options = {}) {
    const mediaId = firestoreMediaIdFromPath(imagePath);
    if (mediaId) {
      await deleteFirestoreMediaByPath(imagePath);
      return;
    }
    // Las URL externas no pertenecen al sistema y nunca se eliminan físicamente.
    // Las imágenes antiguas de otros proveedores se conservan por compatibilidad.
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
    let existing = products.find(product => String(product.id) === String(id)) || null;
    if (id && window.db) {
      try {
        const snapshot = await db.collection(COLL.products).doc(id).get();
        if (snapshot.exists) existing = { id: snapshot.id, ...snapshot.data() };
      } catch (error) {
        console.warn('No se pudo refrescar el producto antes de guardar:', error?.message || error);
      }
    }

    const reference = id ? db.collection(COLL.products).doc(id) : db.collection(COLL.products).doc();
    const button = event.submitter || event.target.querySelector('[type="submit"]');
    const oldHtml = button?.innerHTML;
    if (button) {
      button.disabled = true;
      button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Guardando';
    }

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

      const oldMediaPath = String(existing?.imagePath || '');
      const existingInlineImages = getInlineProductImages(existing);

      if (state.removeProductImageRequested) {
        data.images = [];
        data.imagePath = null;
        data.imageUrl = null;
        data.imageOriginalUrl = null;
        data.imageProvider = null;
        data.imageMediaId = null;
        data.imageWidth = null;
        data.imageHeight = null;
        data.imageBytes = null;
        data.imageFormat = null;
        data.imageContentType = null;
        data.imageOriginalName = null;
        data.imageOriginalType = null;
        data.imageOriginalBytes = null;
      } else if (state.selectedProductFile) {
        const optimized = await optimizeImageForFirestore(state.selectedProductFile, 'product');
        data.images = [optimized.dataUrl];
        data.imagePath = null;
        data.imageUrl = null;
        data.imageOriginalUrl = null;
        data.imageProvider = 'firestore-inline-base64';
        data.imageMediaId = null;
        data.imageWidth = optimized.width;
        data.imageHeight = optimized.height;
        data.imageBytes = optimized.bytes;
        data.imageFormat = optimized.contentType.replace('image/', '');
        data.imageContentType = optimized.contentType;
        data.imageOriginalName = optimized.originalName;
        data.imageOriginalType = optimized.originalType || null;
        data.imageOriginalBytes = optimized.originalBytes;
      } else if (enteredImageUrl) {
        data.images = [];
        data.imagePath = null;
        data.imageUrl = enteredImageUrl;
        data.imageOriginalUrl = null;
        data.imageProvider = 'external';
        data.imageMediaId = null;
        data.imageWidth = null;
        data.imageHeight = null;
        data.imageBytes = null;
        data.imageFormat = null;
        data.imageContentType = null;
        data.imageOriginalName = null;
        data.imageOriginalType = null;
        data.imageOriginalBytes = null;
      } else if (existingInlineImages.length) {
        data.images = existingInlineImages;
        data.imagePath = null;
        data.imageUrl = null;
        data.imageOriginalUrl = null;
        data.imageProvider = 'firestore-inline-base64';
        data.imageMediaId = null;
        data.imageWidth = existing?.imageWidth || null;
        data.imageHeight = existing?.imageHeight || null;
        data.imageBytes = existing?.imageBytes || dataUrlApproxBytes(existingInlineImages[0]);
        data.imageContentType = existing?.imageContentType || String(existingInlineImages[0]).slice(5, String(existingInlineImages[0]).indexOf(';')) || 'image/webp';
        data.imageFormat = existing?.imageFormat || String(data.imageContentType).replace('image/', '');
        data.imageOriginalName = existing?.imageOriginalName || null;
        data.imageOriginalType = existing?.imageOriginalType || null;
        data.imageOriginalBytes = existing?.imageOriginalBytes || null;
      } else if (existing) {
        data.images = [];
        data.imagePath = existing.imagePath || null;
        data.imageUrl = existing.imageUrl || null;
        data.imageOriginalUrl = existing.imageOriginalUrl || null;
        data.imageProvider = existing.imageProvider || null;
        data.imageMediaId = existing.imageMediaId || firestoreMediaIdFromPath(existing.imagePath);
        data.imageWidth = existing.imageWidth || null;
        data.imageHeight = existing.imageHeight || null;
        data.imageBytes = existing.imageBytes || null;
        data.imageFormat = existing.imageFormat || null;
        data.imageContentType = existing.imageContentType || null;
        data.imageOriginalName = existing.imageOriginalName || null;
        data.imageOriginalType = existing.imageOriginalType || null;
        data.imageOriginalBytes = existing.imageOriginalBytes || null;
      } else {
        data.images = [];
        data.imagePath = null;
        data.imageUrl = null;
        data.imageOriginalUrl = null;
        data.imageProvider = null;
        data.imageMediaId = null;
        data.imageWidth = null;
        data.imageHeight = null;
        data.imageBytes = null;
        data.imageFormat = null;
        data.imageContentType = null;
        data.imageOriginalName = null;
        data.imageOriginalType = null;
        data.imageOriginalBytes = null;
      }

      const estimate = new Blob([JSON.stringify({ ...data, updatedAt: null, createdAt: null })]).size;
      if (estimate > 850000) {
        throw new Error('El producto queda demasiado grande para Firestore. Usa una imagen más pequeña.');
      }

      if (id) {
        await reference.update(data);
      } else {
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await reference.set(data);
      }

      // Limpieza de una imagen antigua creada por los parches anteriores en /media.
      // Las nuevas imágenes de producto ya no crean documentos en esa colección.
      if (oldMediaPath.startsWith('firestore-media:') && data.imagePath !== oldMediaPath) {
        await deleteFirestoreMediaByPath(oldMediaPath);
      }
      if (oldMediaPath && !oldMediaPath.startsWith('firestore-media:') && data.imagePath !== oldMediaPath && existing?.imageProvider === 'firebase-storage' && window.storage) {
        storage.ref(oldMediaPath).delete().catch(() => {});
      }

      notify(id ? 'Producto actualizado' : 'Producto creado', 'success');
      bootstrap.Modal.getInstance(document.getElementById('productModal'))?.hide();
      state.selectedProductFile = null;
      state.removeProductImageRequested = false;
      if (state.imagePreviewUrl) {
        URL.revokeObjectURL(state.imagePreviewUrl);
        state.imagePreviewUrl = null;
      }
      window.setTimeout(patchInlineProductImages, 80);
    } catch (error) {
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
    if (!window.__kkFirestoreProductGuardsBound) {
      // Window capture runs before legacy document/form handlers. This prevents old
      // Los manejadores antiguos de imágenes no deben interceptar el guardado Base64 del producto.
      window.addEventListener('input', event => {
        if (event.target?.id !== 'productImageUrl') return;
        event.stopImmediatePropagation();
        state.removeProductImageRequested = false;
        previewProductUrlDebounced(event.target.value);
      }, true);
      window.addEventListener('change', event => {
        if (event.target?.id !== 'productImageFile') return;
        event.stopImmediatePropagation();
        const file = event.target.files?.[0];
        if (file) void selectProductImageFile(file);
      }, true);
      window.addEventListener('submit', event => {
        if (event.target?.id !== 'productForm') return;
        event.stopImmediatePropagation();
        void saveProductEnhanced(event);
      }, true);
      window.__kkFirestoreProductGuardsBound = true;
    }
    const modal = document.getElementById('productModal');
    if (modal && !modal.dataset.kkFirestoreBound) {
      modal.addEventListener('shown.bs.modal', populateProductVariantsFromModal);
      modal.dataset.kkFirestoreBound = '1';
    }
  }

  function setLogoPreview(source, metaText = '') {
    const preview = document.getElementById('kkLogoPreview');
    const empty = document.getElementById('kkLogoPreviewEmpty');
    const meta = document.getElementById('kkLogoMeta');
    if (meta) meta.textContent = metaText;
    if (!preview) return;
    if (!source) {
      preview.removeAttribute('src');
      preview.hidden = true;
      if (empty) empty.hidden = false;
      return;
    }
    preview.onload = () => {
      preview.hidden = false;
      if (empty) empty.hidden = true;
    };
    preview.onerror = () => {
      preview.hidden = true;
      if (empty) {
        empty.hidden = false;
        empty.textContent = 'Vista previa no disponible';
      }
    };
    preview.src = source;
  }

  async function selectLogoFile(file) {
    try {
      await validateImageSecurity(file);
    } catch (error) {
      state.selectedLogoFile = null;
      notify(error.message, 'danger');
      return;
    }
    state.selectedLogoFile = file;
    if (state.logoPreviewUrl) URL.revokeObjectURL(state.logoPreviewUrl);
    state.logoPreviewUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => setLogoPreview(state.logoPreviewUrl, `${image.naturalWidth} × ${image.naturalHeight} px · ${humanBytes(file.size)}`);
    image.onerror = () => setLogoPreview(state.logoPreviewUrl, `${humanBytes(file.size)} · se intentará convertir al subir`);
    image.src = state.logoPreviewUrl;
  }

  function applyPrimaryAppearancePreview(source) {
    const preview = document.getElementById('kBrandPreviewLogo');
    if (!preview) return;
    if (source) {
      const image = document.createElement('img');
      image.src = source;
      image.alt = 'Vista previa del logo';
      image.style.cssText = 'width:100%;height:100%;object-fit:contain';
      preview.replaceChildren(image);
    } else {
      preview.textContent = document.getElementById('kBrandEmoji')?.value.trim() || '🛍️';
    }
  }

  function updatePrimaryAppearanceHelp() {
    const file = document.getElementById('kBrandLogoFile');
    if (file) {
      file.accept = 'image/*,.jpg,.jpeg,.png,.webp,.gif,.svg,.avif,.bmp,.heic,.heif,.tif,.tiff,.ico';
      const help = file.nextElementSibling;
      if (help?.classList?.contains('form-text')) {
        help.textContent = 'Selecciona una imagen. Kiosco la optimiza y la guarda automáticamente en Cloud Firestore. Máximo 5 MB.';
      }
    }
    const url = document.getElementById('kBrandLogoUrl');
    if (url) {
      url.placeholder = 'https://';
      if (!document.getElementById('kkBrandLogoUrlHelp')) {
        const help = document.createElement('div');
        help.id = 'kkBrandLogoUrlHelp';
        help.className = 'form-text text-muted small';
        help.textContent = 'Clic derecho en cualquier imagen → Copiar dirección de imagen → Pegar aquí';
        url.insertAdjacentElement('afterend', help);
      }
    }
  }

  async function selectPrimaryAppearanceLogo(file) {
    if (!file) return;
    try {
      await validateImageSecurity(file);
      state.selectedLogoFile = file;
      if (state.logoPreviewUrl) URL.revokeObjectURL(state.logoPreviewUrl);
      state.logoPreviewUrl = URL.createObjectURL(file);
      applyPrimaryAppearancePreview(state.logoPreviewUrl);
    } catch (error) {
      state.selectedLogoFile = null;
      const input = document.getElementById('kBrandLogoFile');
      if (input) input.value = '';
      notify(error.message, 'danger');
    }
  }

  function applyThemeChangesToInterface(changes) {
    if (changes.storeName) {
      document.querySelectorAll('.logo-text').forEach(element => { element.textContent = changes.storeName; });
      document.title = changes.storeName;
      if (window.APP_CONFIG) window.APP_CONFIG.storeName = changes.storeName;
    }
    if (/^#[0-9a-f]{6}$/i.test(String(changes.accentColor || ''))) {
      const color = changes.accentColor;
      const rgb = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16)).join(',');
      document.documentElement.style.setProperty('--accent', color);
      document.documentElement.style.setProperty('--accent-rgb', rgb);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
    }
    if (changes.storeLogoUrl) applyLogoToInterface(changes.storeLogoUrl);
    else if (changes.storeEmoji) {
      document.querySelectorAll('.logo-icon').forEach(element => { element.textContent = changes.storeEmoji; });
    }
  }

  function validateExternalImageUrl(value) {
    return new Promise((resolve, reject) => {
      let parsed;
      try {
        parsed = new URL(value);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
      } catch (error) {
        reject(new Error('La dirección URL del logo no es válida.'));
        return;
      }
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error('No se pudo cargar la imagen. Verifica el URL.'));
      image.src = value;
    });
  }

  async function savePrimaryAppearanceFirestore(event) {
    event?.preventDefault?.();
    event?.stopImmediatePropagation?.();
    if (!permissionFor('appearance')) return notify('No tienes permiso para modificar la apariencia.', 'warning');
    if (!window.db || !window.auth?.currentUser) return notify('Debes iniciar sesión como administrador.', 'danger');
    const button = document.getElementById('kSaveAppearance');
    const oldHtml = button?.innerHTML;
    if (button) {
      button.disabled = true;
      button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Guardando';
    }
    let uploaded = null;
    try {
      const previous = await currentThemeMedia() || {};
      const typedUrl = String(document.getElementById('kBrandLogoUrl')?.value || '').trim();
      let nextLogoUrl = previous.storeLogoUrl || null;
      let nextLogoPath = previous.storeLogoPath || null;
      let nextProvider = previous.storeLogoProvider || null;

      if (state.selectedLogoFile) {
        uploaded = await uploadFirestoreImage(state.selectedLogoFile, 'logo', 'theme');
        nextLogoUrl = uploaded.imageUrl;
        nextLogoPath = uploaded.imagePath;
        nextProvider = 'firestore';
      } else if (typedUrl && typedUrl !== String(previous.storeLogoUrl || '').trim()) {
        await validateExternalImageUrl(typedUrl);
        nextLogoUrl = typedUrl;
        nextLogoPath = null;
        nextProvider = 'external';
      }

      const changes = {
        storeName: document.getElementById('kBrandName')?.value.trim() || previous.storeName || 'Kiosco',
        storeTagline: document.getElementById('kBrandTagline')?.value.trim() || '',
        accentColor: document.getElementById('kBrandColor')?.value || previous.accentColor || '#f97316',
        storeEmoji: document.getElementById('kBrandEmoji')?.value.trim() || previous.storeEmoji || '🛍️',
        etaMinutes: Math.max(1, Number(document.getElementById('kBrandEta')?.value || previous.etaMinutes || 30)),
        storeLogoUrl: nextLogoUrl,
        storeLogoPath: nextLogoPath,
        storeLogoProvider: nextProvider,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      await db.collection(COLL.config).doc('theme').set(changes, { merge: true });
      if ((previous.storeLogoPath || previous.storeLogoUrl)
        && (previous.storeLogoPath !== nextLogoPath || previous.storeLogoUrl !== nextLogoUrl)) {
        await detachMediaAsset(previous.storeLogoPath, previous.storeLogoUrl, 'logo', 'theme', { removeWhenUnused: true });
      }
      state.selectedLogoFile = null;
      if (state.logoPreviewUrl) {
        URL.revokeObjectURL(state.logoPreviewUrl);
        state.logoPreviewUrl = null;
      }
      const input = document.getElementById('kBrandLogoFile');
      if (input) input.value = '';
      const urlField = document.getElementById('kBrandLogoUrl');
      if (urlField) urlField.value = nextLogoUrl && !String(nextLogoUrl).startsWith('data:image/') ? nextLogoUrl : '';
      applyThemeChangesToInterface(changes);
      applyPrimaryAppearancePreview(nextLogoUrl);
      notify('Apariencia guardada correctamente.', 'success');
    } catch (error) {
      if (uploaded?.imagePath) await deleteFirestoreMediaByPath(uploaded.imagePath);
      notify(`No se pudo guardar la apariencia: ${error.message}`, 'danger');
    } finally {
      if (button) {
        button.disabled = false;
        button.innerHTML = oldHtml || '<i class="bi bi-save me-2"></i>Guardar y publicar';
      }
    }
  }

  async function removePrimaryAppearanceLogo(event) {
    event?.preventDefault?.();
    event?.stopImmediatePropagation?.();
    if (!permissionFor('appearance')) return notify('No tienes permiso para modificar la apariencia.', 'warning');
    if (!window.confirm('¿Quitar el logo actual?')) return;
    try {
      const previous = await currentThemeMedia() || {};
      await db.collection(COLL.config).doc('theme').set({
        storeLogoUrl: null,
        storeLogoPath: null,
        storeLogoProvider: null,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      if (previous.storeLogoPath || previous.storeLogoUrl) {
        await detachMediaAsset(previous.storeLogoPath, previous.storeLogoUrl, 'logo', 'theme', { removeWhenUnused: true });
      }
      state.selectedLogoFile = null;
      const file = document.getElementById('kBrandLogoFile');
      const url = document.getElementById('kBrandLogoUrl');
      if (file) file.value = '';
      if (url) url.value = '';
      applyPrimaryAppearancePreview(null);
      applyLogoToInterface('icons/icon-192.png');
      notify('Logo eliminado.', 'success');
    } catch (error) {
      notify(`No se pudo quitar el logo: ${error.message}`, 'danger');
    }
  }

  function bindPrimaryAppearanceFirestore() {
    updatePrimaryAppearanceHelp();
    if (window.__kkPrimaryAppearanceFirestoreBound) return;
    window.addEventListener('change', event => {
      if (event.target?.id !== 'kBrandLogoFile') return;
      event.stopImmediatePropagation();
      const file = event.target.files?.[0];
      if (file) void selectPrimaryAppearanceLogo(file);
    }, true);
    window.addEventListener('click', event => {
      const target = event.target?.closest?.('#kSaveAppearance, #kRemoveLogo');
      if (!target) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (target.id === 'kSaveAppearance') void savePrimaryAppearanceFirestore(event);
      else void removePrimaryAppearanceLogo(event);
    }, true);
    window.__kkPrimaryAppearanceFirestoreBound = true;
  }

  async function saveMediaConfig(event) {
    event?.preventDefault?.();
    notify('Las imágenes se guardan directamente en Firestore. No necesitas configurar servicios externos.', 'info');
  }

  function applyLogoToInterface(url) {
    if (!url) return;
    document.querySelectorAll('.logo-icon').forEach(container => {
      const image = document.createElement('img');
      image.src = url;
      image.alt = 'Logo';
      image.width = 32;
      image.height = 32;
      image.style.cssText = 'width:32px;height:32px;border-radius:6px;object-fit:cover';
      container.replaceChildren(image);
    });
    const splash = document.querySelector('#kioscoSystemSplash img');
    if (splash) splash.src = url;
  }

  async function currentThemeMedia() {
    if (!window.db || !window.COLL) return null;
    try {
      const doc = await db.collection(COLL.config).doc('theme').get();
      return doc.exists ? doc.data() : null;
    } catch (error) {
      return null;
    }
  }

  async function applyLogoAsset(asset) {
    if (!asset?.url) return;
    if (!permissionFor('appearance')) return notify('No tienes permiso para modificar la apariencia.', 'warning');
    const previous = await currentThemeMedia();
    await db.collection(COLL.config).doc('theme').set({
      storeLogoUrl: asset.url,
      storeLogoPath: asset.imagePath || null,
      storeLogoProvider: asset.provider || 'external',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    if ((previous?.storeLogoPath || previous?.storeLogoUrl) && (previous?.storeLogoPath !== asset.imagePath || previous?.storeLogoUrl !== asset.url)) {
      await detachMediaAsset(previous.storeLogoPath, previous.storeLogoUrl, 'logo', 'theme', { removeWhenUnused: true });
    }
    const field = document.getElementById('brandLogoUrl');
    if (field) field.value = asset.url;
    applyLogoToInterface(asset.url);
    setLogoPreview(asset.url, `${asset.width || '—'} × ${asset.height || '—'} px${asset.bytes ? ` · ${humanBytes(asset.bytes)}` : ''}`);
    notify('Logo actualizado correctamente.', 'success');
  }

  async function saveLogoExternalUrl() {
    const field = document.getElementById('brandLogoUrl');
    const value = field?.value.trim() || '';
    if (!value) return notify('Ingresa una dirección URL para el logo.', 'warning');
    if (!permissionFor('appearance')) return notify('No tienes permiso para modificar la apariencia.', 'warning');
    let parsed;
    try {
      parsed = new URL(value);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
    } catch (error) {
      return notify('La dirección URL del logo no es válida.', 'danger');
    }
    const image = new Image();
    image.onload = async () => {
      try {
        await applyLogoAsset({
          provider: 'external',
          imagePath: null,
          url: value,
          width: image.naturalWidth,
          height: image.naturalHeight,
          bytes: estimateImageSize(image.naturalWidth, image.naturalHeight)
        });
      } catch (error) {
        notify(`No se pudo guardar el logo: ${error.message}`, 'danger');
      }
    };
    image.onerror = () => notify('No se pudo cargar la imagen. Verifica el URL.', 'danger');
    image.src = value;
  }

  async function removeLogoFromAdmin() {
    if (!permissionFor('appearance')) return notify('No tienes permiso para modificar la apariencia.', 'warning');
    if (!window.confirm('¿Quitar el logo actual?')) return;
    try {
      const previous = await currentThemeMedia();
      await db.collection(COLL.config).doc('theme').set({
        storeLogoUrl: null,
        storeLogoPath: null,
        storeLogoProvider: null,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      if (previous?.storeLogoPath || previous?.storeLogoUrl) {
        await detachMediaAsset(previous.storeLogoPath, previous.storeLogoUrl, 'logo', 'theme', { removeWhenUnused: true });
      }
      const field = document.getElementById('brandLogoUrl');
      if (field) field.value = '';
      applyLogoToInterface('icons/icon-192.png');
      setLogoPreview(null, 'Sin logo personalizado');
      notify('Logo eliminado del sistema.', 'success');
    } catch (error) {
      notify(`No se pudo quitar el logo: ${error.message}`, 'danger');
    }
  }

  async function uploadLogoFromAdmin() {
    if (!state.selectedLogoFile) return notify('Selecciona un archivo de imagen para el logo.', 'warning');
    if (!permissionFor('appearance')) return notify('No tienes permiso para modificar la apariencia.', 'warning');
    const button = document.getElementById('kkUploadLogo');
    const old = button?.innerHTML;
    if (button) {
      button.disabled = true;
      button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Subiendo';
    }
    try {
      const uploaded = await uploadFirestoreImage(state.selectedLogoFile, 'logo', 'theme');
      await applyLogoAsset(uploaded);
      state.selectedLogoFile = null;
    } catch (error) {
      notify(`No se pudo subir el logo: ${error.message}`, 'danger');
    } finally {
      if (button) {
        button.disabled = false;
        button.innerHTML = old;
      }
    }
  }

  async function populateMediaAdmin() {
    const existing = document.getElementById('brandLogoUrl')?.value.trim() || '';
    if (existing) setLogoPreview(existing, 'Logo actual');
  }

  function ensureMediaManager() {
    const grid = document.querySelector('#kkAppearanceTools .kk-admin-grid');
    purgeLegacyCloudinaryUi();
    bindPrimaryAppearanceFirestore();
    updatePrimaryAppearanceHelp();
    if (document.getElementById('kBrandLogoFile')) {
      document.querySelectorAll('[id="kkLogoUploadCard"]').forEach(card => card.remove());
      return;
    }
    if (!grid) return;
    const existingLogoCard = document.getElementById('kkLogoUploadCard');
    if (existingLogoCard?.dataset.kkStorage === 'firestore') return;
    existingLogoCard?.remove();
    const logo = document.createElement('div');
    logo.className = 'card';
    logo.id = 'kkLogoUploadCard';
    logo.dataset.kkStorage = 'firestore';
    logo.innerHTML = `<div class="card-body"><h3 class="h6"><i class="bi bi-image me-2"></i>Logo del negocio</h3><p class="small text-muted">La imagen se optimiza y se guarda automáticamente en Firestore.</p><div id="kkLogoDropZone" class="kk-drop-zone kk-logo-drop" tabindex="0" role="button"><i class="bi bi-cloud-arrow-up d-block mb-1"></i><span>Arrastra el logo aquí o haz clic para seleccionar · máximo 5MB</span><input type="file" id="kkLogoFile" class="visually-hidden" accept="image/*,.jpg,.jpeg,.jpe,.png,.webp,.gif,.svg,.avif,.bmp,.heic,.heif,.tif,.tiff,.ico"></div><div class="kk-logo-preview mt-3"><img id="kkLogoPreview" alt="Vista previa del logo" hidden><div id="kkLogoPreviewEmpty" class="text-muted small">Sin vista previa</div></div><div id="kkLogoMeta" class="small text-muted mt-2"></div><div class="d-flex flex-wrap gap-2 mt-3"><button type="button" class="btn btn-primary btn-sm" id="kkUploadLogo"><i class="bi bi-upload me-1"></i>Subir y aplicar</button><button type="button" class="btn btn-outline-danger btn-sm" id="kkRemoveLogo"><i class="bi bi-trash me-1"></i>Quitar logo</button></div><div class="form-text mt-2">También puedes usar una dirección URL externa desde el campo de logo de Apariencia.</div></div>`;
    grid.append(logo);
    const file = document.getElementById('kkLogoFile');
    const zone = document.getElementById('kkLogoDropZone');
    zone?.addEventListener('click', () => file?.click());
    zone?.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        file?.click();
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
      if (dropped) void selectLogoFile(dropped);
    });
    file?.addEventListener('change', event => {
      const selected = event.target.files?.[0];
      if (selected) void selectLogoFile(selected);
    });
    document.getElementById('kkUploadLogo')?.addEventListener('click', uploadLogoFromAdmin);
    document.getElementById('kkRemoveLogo')?.addEventListener('click', removeLogoFromAdmin);
    const logoUrl = document.getElementById('brandLogoUrl');
    if (logoUrl) {
      logoUrl.type = 'url';
      logoUrl.placeholder = 'https://';
      if (!document.getElementById('kkLogoUrlHelp')) {
        const help = document.createElement('div');
        help.id = 'kkLogoUrlHelp';
        help.className = 'form-text text-muted small';
        help.textContent = 'Clic derecho en cualquier imagen → Copiar dirección de imagen → Pegar aquí';
        logoUrl.insertAdjacentElement('afterend', help);
      }
      if (!document.getElementById('kkLogoUrlActions')) {
        const actions = document.createElement('div');
        actions.id = 'kkLogoUrlActions';
        actions.className = 'd-flex flex-wrap gap-2 mt-2';
        actions.innerHTML = '<button type="button" class="btn btn-outline-secondary btn-sm" id="kkPasteLogoUrl"><i class="bi bi-clipboard me-1"></i>Pegar URL</button><button type="button" class="btn btn-outline-primary btn-sm" id="kkSaveLogoUrl"><i class="bi bi-link-45deg me-1"></i>Guardar URL como logo</button>';
        logoUrl.insertAdjacentElement('afterend', actions);
        document.getElementById('kkPasteLogoUrl')?.addEventListener('click', async () => {
          try {
            logoUrl.value = String(await navigator.clipboard.readText() || '').trim();
            logoUrl.dispatchEvent(new Event('input', { bubbles: true }));
          } catch (error) { notify('No se pudo leer el portapapeles.', 'warning'); }
        });
        document.getElementById('kkSaveLogoUrl')?.addEventListener('click', saveLogoExternalUrl);
      }
    }
    void populateMediaAdmin();
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
    if (!state.accessReady) return;
    const p = state.access.permissions;
    if (!p && !state.access.mainAdmin) return;
    document.querySelectorAll('#page-admin [data-admin-section]').forEach(link => {
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
    if (window.__kkPermissionGuardBound) return;
    window.__kkPermissionGuardBound = true;
    document.addEventListener('click', event => {
      const link = event.target?.closest?.('#page-admin [data-admin-section]');
      if (!link || !window.auth?.currentUser) return;
      if (!state.accessReady) return;
      const section = link.dataset.adminSection || '';
      if (permissionFor(section)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      notify('No tienes permiso para acceder a esta sección.', 'warning');
      const dashboard = document.querySelector('#page-admin [data-admin-section="dashboard"]');
      if (dashboard && permissionFor('dashboard')) dashboard.click();
    }, true);
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
      const id = await blockedClientDocId(phone);
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

  function patchAdminProductDelete() {
    if (!window.Admin || typeof Admin.deleteProduct !== 'function' || Admin.__kkMediaDeletePatched) return;
    Admin.deleteProduct = async productIdValue => {
      const productId = String(productIdValue || '');
      const existing = (Admin.getProducts?.() || []).find(item => String(item.id) === productId) || null;
      if (!existing || !productId) return;
      if (!permissionFor('products', 'delete')) return notify('No tienes permiso para eliminar productos.', 'warning');
      if (!window.confirm(`¿Eliminar "${existing.name || 'producto'}"?`)) return;
      try {
        await db.collection(COLL.products).doc(productId).delete();
        if (String(existing.imagePath || '').startsWith('firestore-media:')) await deleteFirestoreMediaByPath(existing.imagePath);
        else if (existing.imagePath && existing.imageProvider === 'firebase-storage' && window.storage) storage.ref(existing.imagePath).delete().catch(() => {});
        notify('Producto eliminado', 'info');
      } catch (error) {
        notify(`No se pudo eliminar el producto: ${error.message}`, 'danger');
      }
    };
    Admin.__kkMediaDeletePatched = true;
  }

  function purgeLegacyCloudinaryUi() {
    const currentConfig = document.getElementById('kkMediaConfigCard');
    if (currentConfig && currentConfig.dataset.kkRetired !== 'true') {
      currentConfig.remove();
    }
    ['kkMediaConfigForm', 'kkCloudName', 'kkUploadPreset'].forEach(id => {
      document.getElementById(id)?.remove();
    });
    document.querySelectorAll('#kkAppearanceTools .card').forEach(card => {
      const text = String(card.textContent || '');
      if (/Cloudinary|Upload preset unsigned|Cloud name/i.test(text)) card.remove();
    });
    document.querySelectorAll('[id="kkLogoUploadCard"]').forEach(card => {
      if (card.dataset.kkStorage !== 'firestore') card.remove();
    });

    // Sentinel: previous enhancement bundles looked only for this ID before
    // injecting their Cloudinary panel. Keeping a hidden retired marker stops
    // them from recreating that obsolete UI while this compatibility layer runs.
    if (!document.getElementById('kkMediaConfigCard')) {
      const sentinel = document.createElement('div');
      sentinel.id = 'kkMediaConfigCard';
      sentinel.dataset.kkRetired = 'true';
      sentinel.hidden = true;
      sentinel.setAttribute('aria-hidden', 'true');
      (document.querySelector('#kkAppearanceTools .kk-admin-grid') || document.body).append(sentinel);
    }
  }


  function removeLegacyMediaUi() {
    document.querySelectorAll('[data-admin-section="media"]').forEach(element => element.remove());
    document.getElementById('sec-media')?.remove();
    document.getElementById('kkMediaPickerModal')?.remove();
    document.getElementById('kkChooseProductLibrary')?.remove();
    document.getElementById('kkChooseLogoLibrary')?.remove();
    purgeLegacyCloudinaryUi();
  }

  function initAdminDynamicEnhancements() {
    ensureAppearancePanel();
    removeLegacyMediaUi();
    patchAdminProductDelete();
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
      window.setTimeout(patchInlineProductImages, 0);
    });
    document.querySelectorAll('[data-admin-section]').forEach(link => link.addEventListener('click', () => window.setTimeout(initAdminDynamicEnhancements, 30)));
    const observer = new MutationObserver(debounce(() => {
      purgeLegacyCloudinaryUi();
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
    console.info('[Kiosco] imagenes Base64 inline + mantenimiento | 1.27.2');
    hardenUrlPrivacy();
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
    bindPrimaryAppearanceFirestore();
    bindStaffEnhancements();
    bindPermissionGuard();
    bindReorder();
    bindTouchGestures();
    bindAdminEnhancementEvents();
    removeLegacyMediaUi();
    patchAdminProductDelete();
    ensureReorderModal();
    ensureBlockModal();
    updateOfflineUi();
    // La validación administrativa la conserva el flujo original de app.js.
    // Este módulo solo amplía permisos después de que Auth.checkIsAdmin resuelve.
  }

  window.KIOSCO_SYSTEM_STORAGE = 'product-inline-base64';
  window.KIOSCO_SYSTEM_BUILD = '1.27.2';
  patchAuthAccess();

  window.KioscoSystem = Object.freeze({
    init,
    applyCatalogEnhancements,
    loadSessions,
    loadBlockedClients,
    handleProductAdd,
    loadMediaConfig,
    uploadFirestoreImage,
    optimizeImageForFirestore,
    getProductDisplayImage,
    sanitizeUrlForPrivacy
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();

// ===== Funcionalidad integrada: maintenance =====
'use strict';

(() => {
  const VERSION = '1.27.2';
  const LOW_STOCK_LIMIT = 5;
  const JS_QR_CDN = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
  const JSPDF_CDN = 'https://unpkg.com/jspdf@4.2.1/dist/jspdf.umd.min.js';
  const state = {
    search: '',
    stockFilter: 'all',
    products: [],
    categories: [],
    observer: null,
    refreshTimer: 0,
    mounted: false
  };

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normalize(value) {
    return String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function notify(message, type = 'info') {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
      return;
    }
    console.info(`[Kiosco:${type}] ${message}`);
  }

  function currentProducts() {
    return window.Admin?.getProducts?.() || state.products || [];
  }

  function currentCategories() {
    return window.Admin?.getCategories?.() || state.categories || [];
  }

  function categoryName(id) {
    if (!id) return 'Sin categoria';
    return currentCategories().find(item => String(item.id) === String(id))?.name || 'Sin categoria';
  }

  function productImage(product) {
    const inline = Array.isArray(product?.images) ? product.images.find(value => String(value || '').startsWith('data:image/')) : null;
    return inline || product?.resolvedImageUrl || product?.imageUrl || '';
  }

  function isFiniteStock(product) {
    return product?.stock !== null && product?.stock !== undefined && product?.stock !== '' && Number.isFinite(Number(product.stock));
  }

  function stockValue(product) {
    return isFiniteStock(product) ? Math.max(0, Math.trunc(Number(product.stock))) : null;
  }

  function isLowStock(product) {
    const stock = stockValue(product);
    return product?.active !== false && stock !== null && stock <= LOW_STOCK_LIMIT;
  }

  function removeEasyReading() {
    localStorage.removeItem('kk_accessible');
    document.documentElement.style.fontSize = '';
    document.body?.classList.remove('accessible-mode');
    document.querySelectorAll('#kkAccessibleBtn, [data-kiosco-accessible], .kk-accessibility-btn').forEach(el => el.remove());
  }

  function dedupeSplash() {
    const possible = [...document.querySelectorAll('#kioscoSystemSplash, #kioscoSplash, #appSplash, .kiosco-splash-screen[data-kiosco-splash]')];
    if (!possible.length) return;
    const preferred = document.getElementById('kioscoSystemSplash') || possible[0];
    possible.forEach(item => {
      if (item !== preferred) item.remove();
    });
    preferred.dataset.kioscoUnified = 'true';
  }

  function protectPasswords(root = document) {
    root.querySelectorAll?.('input').forEach(input => {
      const context = normalize([
        input.id,
        input.name,
        input.placeholder,
        input.getAttribute('aria-label'),
        input.closest('.mb-3, .mb-4, .form-group, td, .card')?.querySelector('label, th, .form-label')?.textContent
      ].join(' '));
      if (!/(password|contrasena|clave|passwd)/.test(context)) return;
      if (input.type !== 'password') input.type = 'password';
      input.autocomplete = 'new-password';
    });

    root.querySelectorAll?.('[data-password], [data-field="password"], [data-field="contrasena"], .staff-password').forEach(el => {
      if (el.matches('input')) {
        el.type = 'password';
        return;
      }
      el.textContent = '********';
    });

    root.querySelectorAll?.('table').forEach(table => {
      const headers = [...table.querySelectorAll('thead th')];
      headers.forEach((header, index) => {
        if (!/(password|contrasena|clave)/.test(normalize(header.textContent))) return;
        table.querySelectorAll('tbody tr').forEach(row => {
          const cell = row.children[index];
          if (cell && !cell.querySelector('input')) cell.textContent = '********';
        });
      });
    });
  }

  function mountProductSearch() {
    const section = document.getElementById('sec-products');
    const grid = document.getElementById('adminProductsGrid');
    if (!section || !grid) return;

    const heading = section.querySelector('.section-title')?.closest('.d-flex');
    if (heading && !document.getElementById('kkProductToolbar')) {
      const toolbar = document.createElement('div');
      toolbar.id = 'kkProductToolbar';
      toolbar.className = 'kk-product-toolbar card mb-3';
      toolbar.innerHTML = `
        <div class="card-body py-2 px-3">
          <div class="row g-2 align-items-center">
            <div class="col-12 col-lg">
              <div class="input-group input-group-sm">
                <span class="input-group-text"><i class="bi bi-search"></i></span>
                <input id="kkAdminProductSearch" type="search" class="form-control" placeholder="Buscar por nombre, descripcion o categoria" autocomplete="off">
                <button type="button" class="btn btn-outline-secondary" id="kkClearProductSearch" title="Limpiar busqueda"><i class="bi bi-x-lg"></i></button>
              </div>
            </div>
            <div class="col-12 col-sm-auto">
              <select id="kkProductStockFilter" class="form-select form-select-sm" aria-label="Filtrar por stock">
                <option value="all">Todos los productos</option>
                <option value="low">Stock bajo (0-${LOW_STOCK_LIMIT})</option>
                <option value="out">Sin stock</option>
              </select>
            </div>
            <div class="col-6 col-sm-auto d-grid">
              <button type="button" class="btn btn-outline-primary btn-sm" id="kkAdminQrScannerBtn"><i class="bi bi-qr-code-scan me-1"></i>Escanear QR</button>
            </div>
            <div class="col-6 col-sm-auto text-end small text-body-secondary"><span id="kkProductSearchCount">0</span> visibles</div>
          </div>
        </div>`;
      heading.insertAdjacentElement('afterend', toolbar);
      document.getElementById('kkAdminProductSearch')?.addEventListener('input', event => {
        state.search = normalize(event.target.value);
        applyProductSearch();
      });
      document.getElementById('kkClearProductSearch')?.addEventListener('click', () => {
        const input = document.getElementById('kkAdminProductSearch');
        if (input) input.value = '';
        state.search = '';
        applyProductSearch();
      });
      document.getElementById('kkProductStockFilter')?.addEventListener('change', event => {
        state.stockFilter = event.target.value;
        applyProductSearch();
      });
      document.getElementById('kkAdminQrScannerBtn')?.addEventListener('click', () => openQrScanner());
    }

    applyProductSearch();
  }

  function applyProductSearch() {
    const cards = [...document.querySelectorAll('#adminProductsGrid [data-admin-product-id]')];
    const products = currentProducts();
    let visible = 0;
    cards.forEach(wrapper => {
      const product = products.find(item => String(item.id) === String(wrapper.dataset.adminProductId));
      if (!product) {
        wrapper.hidden = false;
        visible += 1;
        return;
      }
      const haystack = normalize(`${product.name || ''} ${product.description || ''} ${categoryName(product.categoryId)} ${categoryName(product.subcategoryId)}`);
      const matchesSearch = !state.search || haystack.includes(state.search);
      const stock = stockValue(product);
      const matchesStock = state.stockFilter === 'all'
        || (state.stockFilter === 'low' && isLowStock(product))
        || (state.stockFilter === 'out' && stock === 0);
      const show = matchesSearch && matchesStock;
      wrapper.hidden = !show;
      if (show) visible += 1;
    });
    const count = document.getElementById('kkProductSearchCount');
    if (count) count.textContent = String(visible);
  }

  function createAdminLink(sectionName, icon, label, id) {
    const link = document.createElement('a');
    link.href = '#';
    link.className = 'nav-link';
    link.dataset.adminSection = sectionName;
    if (id) link.id = id;
    link.innerHTML = `<i class="bi ${icon}"></i> ${esc(label)}`;
    return link;
  }

  function showCustomAdminSection(name) {
    document.querySelectorAll('[data-admin-section]').forEach(link => link.classList.toggle('active', link.dataset.adminSection === name));
    document.querySelectorAll('.admin-section').forEach(section => section.classList.remove('active'));
    document.getElementById(`sec-${name}`)?.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function mountLowStockSection() {
    const content = document.querySelector('#page-admin .admin-content');
    if (!content) return;
    if (!document.getElementById('sec-stock-low')) {
      const section = document.createElement('div');
      section.id = 'sec-stock-low';
      section.className = 'admin-section';
      section.innerHTML = `
        <div class="d-flex align-items-center justify-content-between gap-2 flex-wrap mb-3">
          <div>
            <h2 class="section-title mb-1"><i class="bi bi-exclamation-triangle me-2 text-warning"></i>Stock bajo</h2>
            <div class="text-body-secondary small">Productos activos con ${LOW_STOCK_LIMIT} unidades o menos.</div>
          </div>
          <span class="badge text-bg-warning fs-6" id="kkLowStockCount">0</span>
        </div>
        <div class="card">
          <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
              <thead><tr><th>Producto</th><th>Categoria</th><th>Stock</th><th>Estado</th><th class="text-end">Acciones</th></tr></thead>
              <tbody id="kkLowStockBody"></tbody>
            </table>
          </div>
        </div>`;
      content.append(section);
    }

    const desktopCategories = document.querySelector('.admin-sidebar [data-admin-section="categories"]');
    if (desktopCategories && !document.getElementById('kkLowStockNav')) {
      const link = createAdminLink('stock-low', 'bi-exclamation-triangle', 'Stock bajo', 'kkLowStockNav');
      desktopCategories.insertAdjacentElement('afterend', link);
    }

    const mobileNav = document.getElementById('adminNavMobile');
    if (mobileNav && !document.getElementById('kkLowStockNavMobile')) {
      const link = createAdminLink('stock-low', 'bi-exclamation-triangle', 'Stock bajo', 'kkLowStockNavMobile');
      mobileNav.append(link);
    }
    renderLowStock();
  }

  function renderLowStock() {
    const body = document.getElementById('kkLowStockBody');
    if (!body) return;
    const list = currentProducts().filter(isLowStock).sort((a, b) => (stockValue(a) ?? 9999) - (stockValue(b) ?? 9999));
    const count = document.getElementById('kkLowStockCount');
    if (count) count.textContent = String(list.length);
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="5" class="text-center text-body-secondary py-4"><i class="bi bi-check-circle me-2 text-success"></i>No hay productos con stock bajo.</td></tr>';
      return;
    }
    body.innerHTML = list.map(product => {
      const stock = stockValue(product) ?? 0;
      return `<tr>
        <td><div class="d-flex align-items-center gap-2"><div class="kk-stock-thumb">${productImage(product) ? `<img src="${esc(productImage(product))}" alt="">` : '<i class="bi bi-box-seam"></i>'}</div><div><strong>${esc(product.name)}</strong><div class="small text-body-secondary">S/ ${Number(product.price || 0).toFixed(2)}</div></div></div></td>
        <td>${esc(categoryName(product.categoryId))}</td>
        <td><span class="fw-bold ${stock === 0 ? 'text-danger' : 'text-warning'}">${stock}</span></td>
        <td>${stock === 0 ? '<span class="badge text-bg-danger">Sin stock</span>' : '<span class="badge text-bg-warning">Stock bajo</span>'}</td>
        <td class="text-end"><div class="btn-group btn-group-sm"><button type="button" class="btn btn-outline-success" data-kk-replenish="${esc(product.id)}"><i class="bi bi-box-arrow-in-down"></i><span class="d-none d-md-inline ms-1">Reponer</span></button><button type="button" class="btn btn-outline-primary" data-kk-edit-product="${esc(product.id)}"><i class="bi bi-pencil"></i></button></div></td>
      </tr>`;
    }).join('');
  }

  function loadScript(src, globalPath) {
    const current = globalPath?.split('.').reduce((obj, key) => obj?.[key], window);
    if (current) return Promise.resolve(current);
    return new Promise((resolve, reject) => {
      const found = [...document.scripts].find(script => script.src === src);
      if (found) {
        if (found.dataset.loaded === 'true') return resolve(globalPath?.split('.').reduce((obj, key) => obj?.[key], window));
        found.addEventListener('load', () => resolve(globalPath?.split('.').reduce((obj, key) => obj?.[key], window)), { once: true });
        found.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.addEventListener('load', () => {
        script.dataset.loaded = 'true';
        resolve(globalPath?.split('.').reduce((obj, key) => obj?.[key], window));
      }, { once: true });
      script.addEventListener('error', () => reject(new Error(`No se pudo cargar ${src}`)), { once: true });
      document.head.append(script);
    });
  }

  function openQrScanner() {
    if (!window.KioscoProductExperience?.openScanner) {
      notify('El lector QR todavia se esta preparando.', 'warning');
      return;
    }
    window.KioscoProductExperience.openScanner();
    window.setTimeout(enhanceQrScanner, 100);
  }

  function enhanceQrScanner() {
    const modal = document.getElementById('kioscoQrScannerModal');
    if (!modal) return;
    const body = modal.querySelector('.modal-body');
    if (!body) return;
    let info = document.getElementById('kkQrSecureInfo');
    if (!info) {
      info = document.createElement('div');
      info.id = 'kkQrSecureInfo';
      info.className = 'small text-body-secondary mt-2';
      body.append(info);
    }
    const local = ['localhost', '127.0.0.1'].includes(location.hostname);
    info.innerHTML = (!window.isSecureContext && !local)
      ? '<i class="bi bi-shield-exclamation me-1 text-warning"></i>La camara requiere HTTPS. En produccion Firebase Hosting ya utiliza HTTPS.'
      : '<i class="bi bi-shield-check me-1 text-success"></i>Camara habilitada en un contexto seguro.';

    if (!document.getElementById('kkQrImageFile')) {
      const fallback = document.createElement('div');
      fallback.className = 'kk-qr-file-fallback mt-3 pt-3 border-top';
      fallback.innerHTML = `
        <label class="form-label fw-semibold small" for="kkQrImageFile"><i class="bi bi-image me-1"></i>Leer QR desde una imagen</label>
        <input type="file" id="kkQrImageFile" class="form-control form-control-sm" accept="image/*">
        <div class="form-text">Alternativa gratuita cuando la camara no esta disponible.</div>`;
      body.append(fallback);
      document.getElementById('kkQrImageFile').addEventListener('change', decodeQrImage);
    }
  }

  async function decodeQrImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const bitmap = 'createImageBitmap' in window ? await createImageBitmap(file) : null;
      const image = bitmap || await new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(objectUrl); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('No se pudo leer la imagen')); };
        img.src = objectUrl;
      });
      let rawValue = '';
      if ('BarcodeDetector' in window) {
        try {
          const detector = new BarcodeDetector({ formats: ['qr_code'] });
          const results = await detector.detect(image);
          rawValue = results.find(item => item.rawValue)?.rawValue || '';
        } catch (_) {}
      }
      if (!rawValue) {
        await loadScript(JS_QR_CDN, 'jsQR');
        if (typeof window.jsQR !== 'function') throw new Error('No se pudo cargar el lector QR alternativo');
        const max = 1400;
        const naturalWidth = image.width || image.naturalWidth || 1;
        const naturalHeight = image.height || image.naturalHeight || 1;
        const scale = Math.min(1, max / Math.max(naturalWidth, naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(naturalHeight * scale));
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        rawValue = window.jsQR(data.data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' })?.data || '';
      }
      bitmap?.close?.();
      if (!rawValue) throw new Error('No se encontro un codigo QR valido en la imagen');
      const parsed = new URL(rawValue, location.href);
      const hash = parsed.hash || (rawValue.startsWith('#') ? rawValue : '');
      const prefix = '#producto-';
      if (!hash.startsWith(prefix)) throw new Error('El QR no pertenece a un producto de Kiosco');
      const productId = decodeURIComponent(hash.slice(prefix.length));
      const product = currentProducts().find(item => String(item.id) === String(productId)) || window.Store?.getState?.().products?.find?.(item => String(item.id) === String(productId));
      if (!product) throw new Error('El producto del QR no esta disponible');
      bootstrap.Modal.getOrCreateInstance(document.getElementById('kioscoQrScannerModal'))?.hide();
      window.setTimeout(() => window.KioscoProductExperience?.openProduct?.(product, { pushHistory: true, highlight: true }), 180);
      notify(`QR detectado: ${product.name}`, 'success');
    } catch (error) {
      notify(error.message || 'No se pudo leer el QR', 'danger');
    } finally {
      event.target.value = '';
    }
  }

  async function imageToJpegDataUrl(source) {
    const value = String(source || '');
    if (!value) return null;
    return new Promise((resolve) => {
      const image = new Image();
      if (!value.startsWith('data:')) image.crossOrigin = 'anonymous';
      image.onload = () => {
        try {
          const maxW = 520;
          const maxH = 360;
          const scale = Math.min(1, maxW / Math.max(1, image.naturalWidth), maxH / Math.max(1, image.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        } catch (_) { resolve(null); }
      };
      image.onerror = () => resolve(null);
      image.src = value;
    });
  }

  async function exportCatalogPdfRealtime(button) {
    const products = [...currentProducts()].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));
    if (!products.length) return notify('No hay productos para exportar.', 'warning');
    const original = button?.innerHTML;
    if (button) {
      button.disabled = true;
      button.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Generando PDF';
    }
    try {
      await loadScript(JSPDF_CDN, 'jspdf.jsPDF');
      const jsPDF = window.jspdf?.jsPDF;
      if (!jsPDF) throw new Error('No se pudo iniciar el generador PDF');
      const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
      const margin = 12;
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const currency = window.APP_CONFIG?.currency || 'S/';
      let y = 18;

      const header = () => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(17);
        doc.text(String(window.APP_CONFIG?.storeName || 'Kiosco'), margin, 15);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(95);
        doc.text(`Catalogo actualizado - ${new Date().toLocaleString('es-PE')}`, margin, 21);
        doc.setDrawColor(210);
        doc.line(margin, 25, pageW - margin, 25);
        doc.setTextColor(0);
        y = 31;
      };
      header();

      for (let index = 0; index < products.length; index += 1) {
        const product = products[index];
        const rowH = 34;
        if (y + rowH > pageH - 14) {
          doc.addPage();
          header();
        }
        const imageData = await imageToJpegDataUrl(productImage(product));
        doc.setDrawColor(228);
        doc.roundedRect(margin, y, pageW - margin * 2, rowH - 2, 2, 2, 'S');
        if (imageData) {
          try { doc.addImage(imageData, 'JPEG', margin + 2, y + 2, 29, 28, undefined, 'FAST'); } catch (_) {}
        } else {
          doc.setFillColor(242, 242, 242);
          doc.roundedRect(margin + 2, y + 2, 29, 28, 1, 1, 'F');
          doc.setFontSize(7);
          doc.setTextColor(130);
          doc.text('Sin imagen', margin + 16.5, y + 16, { align: 'center' });
          doc.setTextColor(0);
        }
        const x = margin + 35;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.text(String(product.name || 'Producto').slice(0, 58), x, y + 7);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(90);
        const description = String(product.description || '').replace(/\s+/g, ' ').trim();
        const wrapped = doc.splitTextToSize(description || 'Sin descripcion', 86).slice(0, 2);
        doc.text(wrapped, x, y + 12);
        doc.text(`Categoria: ${categoryName(product.categoryId)}`, x, y + 22);
        doc.text(`Stock: ${stockValue(product) === null ? 'Ilimitado' : stockValue(product)}`, x, y + 27);
        doc.setTextColor(0);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text(`${currency} ${Number(product.price || 0).toFixed(2)}`, pageW - margin - 3, y + 8, { align: 'right' });
        if (isLowStock(product)) {
          doc.setFontSize(7.5);
          doc.setTextColor(190, 80, 20);
          doc.text(stockValue(product) === 0 ? 'SIN STOCK' : 'STOCK BAJO', pageW - margin - 3, y + 15, { align: 'right' });
          doc.setTextColor(0);
        }
        y += rowH;
      }

      const totalPages = doc.getNumberOfPages();
      for (let page = 1; page <= totalPages; page += 1) {
        doc.setPage(page);
        doc.setFontSize(7.5);
        doc.setTextColor(120);
        doc.text(`Pagina ${page} de ${totalPages}`, pageW - margin, pageH - 6, { align: 'right' });
      }
      doc.save(`catalogo-kiosco-${new Date().toISOString().slice(0, 10)}.pdf`);
      notify(`Catalogo PDF generado con ${products.length} productos e imagenes actuales.`, 'success');
    } catch (error) {
      console.error('PDF catalogo:', error);
      notify(`No se pudo generar el catalogo PDF: ${error.message}`, 'danger');
    } finally {
      if (button) {
        button.disabled = false;
        button.innerHTML = original;
      }
    }
  }

  function mountCajaGuide() {
    const section = document.getElementById('sec-caja');
    if (!section || document.getElementById('kkCajaGuide')) return;
    const title = section.querySelector('.section-title');
    if (!title) return;
    const wrapper = document.createElement('div');
    wrapper.id = 'kkCajaGuide';
    wrapper.className = 'd-flex flex-wrap gap-2 align-items-center mb-3';
    wrapper.innerHTML = `<a class="btn btn-outline-danger btn-sm" href="docs/guia-caja.pdf" target="_blank" rel="noopener"><i class="bi bi-file-earmark-pdf me-1"></i>Guia de como usar la Caja</a><span class="small text-body-secondary">Manual incluido en el sistema; no requiere conexion externa.</span>`;
    title.insertAdjacentElement('afterend', wrapper);
  }

  const BILLING_FIELDS = [
    ['kBillingName', 'Razon social / negocio'],
    ['kBillingRuc', 'RUC'],
    ['kBillingSeries', 'Serie'],
    ['kBillingAddress', 'Direccion'],
    ['kBillingPhone', 'Telefono'],
    ['kBillingEmail', 'Correo'],
    ['kBillingTitle', 'Titulo del documento'],
    ['kBillingNext', 'Siguiente numero']
  ];

  function enforceReceiptFields() {
    BILLING_FIELDS.forEach(([id]) => {
      const input = document.getElementById(id);
      if (!input) return;
      input.required = true;
      input.setAttribute('aria-required', 'true');
      const container = input.closest('.col, [class*="col-"], .mb-3, .mb-2') || input.parentElement;
      const label = container?.querySelector('label');
      if (label && !label.querySelector('.kk-required-mark')) label.insertAdjacentHTML('beforeend', ' <span class="text-danger kk-required-mark">*</span>');
    });
  }

  function validateReceiptFields(event) {
    const button = event.target.closest('#kSaveBilling');
    if (!button) return;
    enforceReceiptFields();
    const missing = [];
    let firstInvalid = null;
    BILLING_FIELDS.forEach(([id, label]) => {
      const input = document.getElementById(id);
      if (!input) return;
      if (!String(input.value || '').trim()) {
        missing.push(label);
        firstInvalid ||= input;
        input.classList.add('is-invalid');
      } else input.classList.remove('is-invalid');
    });
    const ruc = document.getElementById('kBillingRuc');
    if (ruc && ruc.value.trim() && !/^\d{11}$/.test(ruc.value.trim())) {
      event.preventDefault();
      event.stopImmediatePropagation();
      ruc.classList.add('is-invalid');
      ruc.focus();
      notify('El RUC debe contener exactamente 11 digitos.', 'danger');
      return;
    }
    const email = document.getElementById('kBillingEmail');
    if (email && email.value.trim()) {
      email.type = 'email';
      if (!email.checkValidity()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        email.classList.add('is-invalid');
        email.focus();
        notify('Ingresa un correo valido para los datos del recibo.', 'danger');
        return;
      }
    }
    const next = document.getElementById('kBillingNext');
    if (next && Number(next.value) < 1) {
      event.preventDefault();
      event.stopImmediatePropagation();
      next.focus();
      notify('El siguiente numero del recibo debe ser mayor a 0.', 'danger');
      return;
    }
    if (missing.length) {
      event.preventDefault();
      event.stopImmediatePropagation();
      firstInvalid?.focus();
      notify(`Completa todos los datos obligatorios del recibo: ${missing.join(', ')}.`, 'danger');
    }
  }

  function mountSupport() {
    const content = document.querySelector('#page-admin .admin-content');
    if (!content) return;
    if (!document.getElementById('sec-support')) {
      const section = document.createElement('div');
      section.id = 'sec-support';
      section.className = 'admin-section';
      section.innerHTML = `
        <h2 class="section-title"><i class="bi bi-headset me-2"></i>Soporte</h2>
        <div class="kk-support-card card mx-auto">
          <div class="card-body text-center p-4 p-lg-5">
            <img src="icons/creador.png" class="kk-creator-image mb-3" alt="Creador Jhonn Pether">
            <div class="text-uppercase small text-body-secondary fw-semibold mb-1">Creador</div>
            <h3 class="h4 mb-2">Jhonn Pether</h3>
            <p class="text-body-secondary mb-4">Soporte y contacto del desarrollador del sistema Kiosco.</p>
            <div class="d-grid d-sm-flex justify-content-center gap-2 mb-4">
              <a class="btn btn-outline-danger" href="mailto:JPSALASJIMENEZ@GMAIL.COM"><i class="bi bi-envelope-fill me-2"></i>Gmail: JPSALASJIMENEZ@GMAIL.COM</a>
              <a class="btn btn-outline-success" href="https://wa.me/51914491874" target="_blank" rel="noopener noreferrer"><i class="bi bi-whatsapp me-2"></i>WhatsApp: +51 914491874</a>
            </div>
            <div class="kk-version-pill"><i class="bi bi-box-seam me-2"></i>Version del sistema <strong>${VERSION}</strong></div>
          </div>
        </div>`;
      content.append(section);
    }

    const desktop = document.querySelector('.admin-sidebar');
    if (desktop && !document.getElementById('kkSupportNav')) {
      const appearance = desktop.querySelector('[data-admin-section="apariencia"]');
      const link = createAdminLink('support', 'bi-headset', 'Soporte', 'kkSupportNav');
      if (appearance) appearance.insertAdjacentElement('afterend', link); else desktop.append(link);
    }
    const mobileNav = document.getElementById('adminNavMobile');
    if (mobileNav && !document.getElementById('kkSupportNavMobile')) {
      mobileNav.append(createAdminLink('support', 'bi-headset', 'Soporte', 'kkSupportNavMobile'));
    }
  }

  function refreshRealtime(products = null, categories = null) {
    if (Array.isArray(products)) state.products = products;
    if (Array.isArray(categories)) state.categories = categories;
    mountProductSearch();
    renderLowStock();
    applyProductSearch();
  }

  function bindGlobalEvents() {
    window.addEventListener('admin:products-updated', event => refreshRealtime(event.detail?.products || []));
    window.addEventListener('admin:categories-updated', event => refreshRealtime(null, event.detail?.categories || []));

    document.addEventListener('click', event => {
      const customNav = event.target.closest('[data-admin-section="stock-low"], [data-admin-section="support"]');
      if (customNav) {
        event.preventDefault();
        event.stopImmediatePropagation();
        showCustomAdminSection(customNav.dataset.adminSection);
        bootstrap.Offcanvas.getInstance(document.getElementById('adminOffcanvas'))?.hide();
        return;
      }
      const replenish = event.target.closest('[data-kk-replenish]');
      if (replenish) {
        event.preventDefault();
        window.KioscoAdminOperations?.openReplenishmentModal?.(replenish.dataset.kkReplenish);
        return;
      }
      const edit = event.target.closest('[data-kk-edit-product]');
      if (edit) {
        event.preventDefault();
        window.Admin?.editProduct?.(edit.dataset.kkEditProduct);
      }
    }, true);

    document.addEventListener('click', event => {
      const exportButton = event.target.closest('#exportCatalogPdfBtn');
      if (!exportButton) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void exportCatalogPdfRealtime(exportButton);
    }, true);

    document.addEventListener('click', validateReceiptFields, true);

    document.addEventListener('shown.bs.modal', event => {
      if (event.target?.id === 'kioscoQrScannerModal') enhanceQrScanner();
    });
  }

  function scheduleMount() {
    window.clearTimeout(state.refreshTimer);
    state.refreshTimer = window.setTimeout(() => {
      removeEasyReading();
      dedupeSplash();
      mountProductSearch();
      mountLowStockSection();
      mountCajaGuide();
      enforceReceiptFields();
      mountSupport();
      protectPasswords();
      enhanceQrScanner();
      refreshRealtime();
    }, 80);
  }

  function initObserver() {
    if (state.observer || !document.body) return;
    state.observer = new MutationObserver(() => scheduleMount());
    state.observer.observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    if (state.mounted) return;
    state.mounted = true;
    window.KIOSCO_VERSION = VERSION;
    removeEasyReading();
    dedupeSplash();
    bindGlobalEvents();
    initObserver();
    scheduleMount();
    console.info(`[Kiosco] mantenimiento y optimizacion ${VERSION}`);
  }

  window.KioscoMaintenance = Object.freeze({
    version: VERSION,
    refresh: scheduleMount,
    exportCatalogPdf: exportCatalogPdfRealtime,
    renderLowStock,
    openQrScanner
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();

// ===== FIN FUNCIONALIDADES INTEGRADAS =====


// RETIRAR_PREFERENCIA_LECTURA_FACIL
(() => {
  try { localStorage.removeItem('kk_accessible'); } catch (_) {}
  const clear = () => {
    document.documentElement.style.fontSize = '';
    document.body?.classList.remove('accessible-mode');
    document.querySelectorAll('#kkAccessibleBtn, [data-kiosco-accessible], .kk-accessibility-btn').forEach(el => el.remove());
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', clear, { once: true });
  else clear();
  new MutationObserver(clear).observe(document.documentElement, { childList: true, subtree: true });
})();
