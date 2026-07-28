// js/notifications.js — Admin: new order real-time alerts
const Notifications = (() => {
  let unsub    = null;
  let active   = false;
  let baseline = null; // timestamp when admin logged in

  function init() {
    active   = true;
    baseline = new Date();
    subscribe();
    requestPermission();
  }

  function stop() {
    active = false;
    if (unsub) { unsub(); unsub = null; }
    document.querySelectorAll('.new-order-alert').forEach(el => el.remove());
  }

  function subscribe() {
    if (unsub) unsub();
    unsub = db.collection(COLL.orders)
      .where('status','==','pending')
      .orderBy('createdAt','desc')
      .limit(1)
      .onSnapshot(snap => {
        if (!active) return;
        snap.docChanges().forEach(ch => {
          if (ch.type !== 'added') return;
          const o  = { id:ch.doc.id, ...ch.doc.data() };
          const ts = o.createdAt?.toDate ? o.createdAt.toDate() : null;
          if (ts && baseline && ts > baseline) {
            showAlert(o);
            vibrate();
            browserNotif(o);
          }
        });
      });
  }

  function showAlert(o) {
    document.querySelectorAll('.new-order-alert').forEach(el => el.remove());
    const el = document.createElement('div');
    el.className = 'new-order-alert';
    el.innerHTML = `
      <span class="alert-icon">🔔</span>
      <div>
        <p class="alert-title">¡Nuevo pedido!</p>
        <p class="alert-sub">👤 ${o.customer||'Cliente'} · ${APP_CONFIG.currency} ${(o.total||0).toFixed(2)}</p>
      </div>
      <button class="alert-close" aria-label="Cerrar">✕</button>`;
    document.body.appendChild(el);

    el.querySelector('.alert-close').addEventListener('click', e => {
      e.stopPropagation(); dismiss(el);
    });
    el.addEventListener('click', () => {
      document.querySelector('[data-section="orders"]')?.click();
      dismiss(el);
    });
    setTimeout(() => el.isConnected && dismiss(el), 9000);
  }

  function dismiss(el) {
    el.style.animation = 'fadeOut .25s ease forwards';
    setTimeout(() => el.remove(), 260);
  }

  function vibrate() {
    try { navigator.vibrate?.([200,100,200]); } catch {}
  }

  async function requestPermission() {
    if ('Notification' in window && Notification.permission === 'default')
      await Notification.requestPermission();
  }

  function browserNotif(o) {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try {
      new Notification(`🛍️ Nuevo pedido en ${APP_CONFIG.storeName}`, {
        body:  `${o.customer||'Cliente'} · ${APP_CONFIG.currency} ${(o.total||0).toFixed(2)}`,
        icon:  'icons/icon-192.svg',
        tag:   'new-order',
        renotify: true
      });
    } catch {}
  }

  return { init, stop, requestPermission };
})();
