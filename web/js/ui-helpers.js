// js/ui-helpers.js — UI helpers: scroll, PWA install, keyboard, connectivity
const UIHelpers = (() => {
  let deferredInstall = null;

  function init() {
    initScrollTop();
    initPWA();
    initKeyboard();
    initConnectivity();
  }

  // ── Scroll-to-top ─────────────────────────────────────────────────────────
  function initScrollTop() {
    const btn = document.createElement('button');
    btn.className = 'scroll-top'; btn.innerHTML = '↑';
    btn.setAttribute('aria-label', 'Volver arriba');
    document.body.appendChild(btn);

    const ps = document.querySelector('.products-section');
    if (ps) {
      ps.addEventListener('scroll', () =>
        btn.classList.toggle('visible', ps.scrollTop > 280)
      );
      btn.addEventListener('click', () => ps.scrollTo({top:0,behavior:'smooth'}));
    }
  }

  // ── PWA install banner ─────────────────────────────────────────────────────
  function initPWA() {
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      deferredInstall = e;
      const dismissed = localStorage.getItem('pwa_dismissed');
      if (dismissed && Date.now()-+dismissed < 7*86400000) return;
      showInstallBanner();
    });
    window.addEventListener('appinstalled', () => showToast('¡Kiosco instalado! 🎉','success'));
  }

  function showInstallBanner() {
    if (document.querySelector('.pwa-banner')) return;
    const banner = document.createElement('div');
    banner.className = 'pwa-banner';
    banner.innerHTML = `<span>📲</span>
      <p>Instala Kiosco en tu dispositivo</p>
      <div class="pwa-actions">
        <button class="btn-primary btn-sm" id="_pwaInstall">Instalar</button>
        <button class="btn-outline btn-sm" id="_pwaDismiss">Después</button>
      </div>`;
    document.body.appendChild(banner);

    banner.querySelector('#_pwaInstall').addEventListener('click', async () => {
      if (!deferredInstall) return;
      deferredInstall.prompt();
      await deferredInstall.userChoice;
      deferredInstall = null;
      banner.remove();
    });
    banner.querySelector('#_pwaDismiss').addEventListener('click', () => {
      localStorage.setItem('pwa_dismissed', Date.now());
      banner.style.animation = 'fadeOut .3s ease forwards';
      setTimeout(() => banner.remove(), 320);
    });
    setTimeout(() => banner.isConnected && banner.remove(), 14000);
  }

  // ── Escape closes modals ──────────────────────────────────────────────────
  function initKeyboard() {
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape')
        document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
    });
  }

  // ── Online/offline indicator ──────────────────────────────────────────────
  function initConnectivity() {
    let offlineBanner = null;
    window.addEventListener('offline', () => {
      if (offlineBanner) return;
      offlineBanner = document.createElement('div');
      offlineBanner.className = 'status-offline';
      offlineBanner.textContent = '⚠️  Sin conexión a internet — los cambios se sincronizarán al reconectar';
      document.body.appendChild(offlineBanner);
    });
    window.addEventListener('online', () => {
      offlineBanner?.remove(); offlineBanner = null;
      showToast('Conexión restaurada ✅', 'success');
    });
  }

  return { init };
})();
