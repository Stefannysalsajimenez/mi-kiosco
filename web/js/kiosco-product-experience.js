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

      const imageWrap = card.querySelector('.prod-img-wrap') || card;
      if (!imageWrap.querySelector('[data-kiosco-share-product]')) {
        const shareButton = document.createElement('button');
        shareButton.type = 'button';
        shareButton.className = 'btn btn-success btn-sm kiosco-product-share-button';
        shareButton.dataset.kioscoShareProduct = product.id;
        shareButton.title = `Compartir ${product.name} por WhatsApp`;
        shareButton.setAttribute('aria-label', `Compartir ${product.name} por WhatsApp`);
        shareButton.innerHTML = '<i class="bi bi-whatsapp" aria-hidden="true"></i>';
        imageWrap.appendChild(shareButton);
      }
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
                  <i class="bi bi-whatsapp me-2"></i>Compartir
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
