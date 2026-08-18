'use strict';

window.KIOSCO_UPGRADE_CONFIG = Object.freeze({
  apiBaseUrl: '',
  mediaApiBaseUrl: '',
  firebaseVapidKey: '',
  enableCallMeBot: false,
  storeUrl: 'https://mi-kiosco-c7313.web.app',
  imageStorage: 'firestore'
});

(() => {
  const privateKeys = new Set([
    'phone', 'telefono', 'telephone', 'mobile', 'user', 'usuario', 'admin', 'role', 'rol',
    'email', 'token', 'idtoken', 'accesstoken', 'refreshtoken', 'jwt', 'auth', 'authorization',
    'password', 'passwd', 'secret', 'apikey', 'uid', 'customerphone', 'clientphone'
  ]);
  const normalizeKey = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  try {
    const url = new URL(window.location.href);
    let changed = false;
    [...url.searchParams.keys()].forEach(key => {
      if (!privateKeys.has(normalizeKey(key))) return;
      url.searchParams.delete(key);
      changed = true;
    });
    if (changed) {
      history.replaceState(history.state, document.title, `${url.pathname}${url.search}${url.hash}`);
    }
  } catch (error) {
    console.warn('No se pudo limpiar la URL:', error);
  }

  let referrer = document.querySelector('meta[name="referrer"]');
  if (!referrer) {
    referrer = document.createElement('meta');
    referrer.name = 'referrer';
    document.head.append(referrer);
  }
  referrer.content = 'no-referrer';


  // Live Server/local development must not keep an old PWA bundle that still
  // contains the retired Cloudinary image handler.
  if (['127.0.0.1', 'localhost'].includes(window.location.hostname)) {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then(registrations => Promise.all(registrations.map(registration => registration.unregister())))
        .catch(() => {});
    }
    if ('caches' in window) {
      caches.keys()
        .then(names => Promise.all(names.filter(name => name.startsWith('kiosco')).map(name => caches.delete(name))))
        .catch(() => {});
    }
  }

  if (!document.getElementById('kioscoSystemSplash') && document.body) {
    const splash = document.createElement('div');
    splash.id = 'kioscoSystemSplash';
    splash.setAttribute('role', 'status');
    splash.setAttribute('aria-live', 'polite');
    const storeName = String(window.APP_CONFIG?.storeName || 'Kiosco').replace(/[&<>"']/g, '');
    splash.innerHTML = `
      <div class="kk-splash-inner">
        <img src="icons/icon-192.png" alt="Logo de la tienda" width="104" height="104">
        <strong>${storeName}</strong>
        <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
        <span class="visually-hidden">Cargando aplicación</span>
      </div>`;
    splash.style.cssText = 'position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:var(--bs-body-bg,#0d0d14);transition:opacity .5s ease,visibility .5s ease;';
    document.body.prepend(splash);
  }

  if (!document.getElementById('kioscoSystemStyles')) {
    const link = document.createElement('link');
    link.id = 'kioscoSystemStyles';
    link.rel = 'stylesheet';
    link.href = 'css/kiosco-system.css';
    document.head.append(link);
  }

  if (!window.__KIOSCO_FIRESTORE_IMAGES_ACTIVE && !window.__KIOSCO_FIRESTORE_IMAGES_LOADING) {
    window.__KIOSCO_FIRESTORE_IMAGES_LOADING = true;
    const script = document.createElement('script');
    script.dataset.kioscoFirestoreImages = 'true';
    script.src = 'js/kiosco-firestore-images.js?build=20260818-firestore-images-fix';
    script.async = false;
    script.addEventListener('error', () => {
      window.__KIOSCO_FIRESTORE_IMAGES_LOADING = false;
      document.getElementById('kioscoSystemSplash')?.remove();
      console.error('No se pudo cargar js/kiosco-firestore-images.js');
    });
    document.body.append(script);
  }
})();
