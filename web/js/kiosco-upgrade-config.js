'use strict';

window.KIOSCO_UPGRADE_CONFIG = Object.freeze({
  apiBaseUrl: '',
  mediaApiBaseUrl: '',
  firebaseVapidKey: '',
  enableCallMeBot: false,
  storeUrl: 'https://mi-kiosco-c7313.web.app'
});

(() => {
  if (!document.getElementById('kioscoSystemSplash') && document.body) {
    const splash = document.createElement('div');
    splash.id = 'kioscoSystemSplash';
    splash.setAttribute('role', 'status');
    splash.setAttribute('aria-live', 'polite');
    splash.innerHTML = `
      <div class="kk-splash-inner">
        <img src="icons/icon-192.png" alt="Logo de la tienda" width="104" height="104">
        <strong>${String(window.APP_CONFIG?.storeName || 'Kiosco').replace(/[&<>"']/g, '')}</strong>
        <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
        <span class="visually-hidden">Cargando aplicación</span>
      </div>`;
    splash.style.cssText = 'position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:var(--bs-body-bg,#0d0d14);transition:opacity .5s ease,visibility .5s ease;';
    document.body.prepend(splash);
  }

  if (!document.getElementById('kioscoSystemStyles')) {
    document.write('<link id="kioscoSystemStyles" rel="stylesheet" href="css/kiosco-system.css">');
  }
  if (!document.querySelector('script[data-kiosco-system]')) {
    document.write('<script data-kiosco-system src="js/kiosco-system.js"></script>');
  }
})();
