// js/admin.js — Admin CRUD: products, categories, caja, horario, personal, apariencia
const Admin = (() => {
  let prods = [], cats = [], unsubP = null, unsubC = null, ready = false, staffCache = [];
  let selectedProductImageFile = null;
  let productSaveInProgress = false;
  let currentProductImagePath = null;
  let currentProductStoredImageUrl = null;
  let currentProductImageUrl = null;
  let imageRemovalRequested = false;
  const productImageUrlCache = new Map();
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
  const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
  const ALLOWED_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
  const XLSX_CDN = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

  function init() {
    if (ready) return;
    ready = true;
    subscribeAll();
    bindNav();
    bindProductModal();
    bindProductsTemplateEnhancement();
    bindCategoryModal();
    bindStaffModal();
    loadBranding();
    loadSchedule();
  }

  function subscribeAll() {
    unsubC = db.collection(COLL.categories).onSnapshot(snap => {
      cats = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'));
      renderCategories(); populateCatSelect();
      // KIOSCO_NINE:ADMIN_CATEGORIES_EVENT
      window.dispatchEvent(new CustomEvent('admin:categories-updated', { detail: { categories: getCategories() } }));
    }, e => console.warn('cats:', e.code));
    unsubP = db.collection(COLL.products).onSnapshot(async snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      prods = await Promise.all(list.map(resolveProductImage));
      prods.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'));
      renderProducts();
      // KIOSCO_NINE:ADMIN_PRODUCTS_EVENT
      window.dispatchEvent(new CustomEvent('admin:products-updated', { detail: { products: getProducts() } }));
    }, e => console.warn('prods:', e.code));
  }

  function bindNav() {
    document.querySelectorAll('[data-admin-section]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-admin-section]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const s = btn.dataset.adminSection;
        document.querySelectorAll('.admin-section').forEach(el => el.classList.remove('active'));
        document.getElementById('sec-' + s)?.classList.add('active');
        if (s === 'dashboard') Dashboard.init();
        if (s === 'orders') Orders.init();
        if (s === 'caja') renderCaja();
        if (s === 'horario') loadSchedule();
        if (s === 'personal') renderStaff();
        if (s === 'apariencia') loadBranding();
      });
    });
  }

  // PRODUCTS
  async function resolveProductImage(product) {
    if (product.imageUrl) return { ...product, resolvedImageUrl: product.imageUrl };
    if (!product.imagePath || !window.storage) return { ...product, resolvedImageUrl: null };

    try {
      if (!productImageUrlCache.has(product.imagePath)) {
        productImageUrlCache.set(product.imagePath, window.storage.ref(product.imagePath).getDownloadURL());
      }
      const resolvedImageUrl = await productImageUrlCache.get(product.imagePath);
      return { ...product, resolvedImageUrl };
    } catch (error) {
      productImageUrlCache.delete(product.imagePath);
      console.warn('Imagen de producto:', error?.message || error);
      return { ...product, resolvedImageUrl: null };
    }
  }

  function renderProducts() {
    const grid = document.getElementById('adminProductsGrid');
    if (!grid) return;
    if (!prods.length) {
      grid.innerHTML = '<div class="col-12 text-center py-5"><i class="bi bi-box display-4 text-muted"></i><p class="mt-3 text-muted">Sin productos</p></div>';
      return;
    }

    grid.innerHTML = prods.map(product => {
      const imageUrl = product.resolvedImageUrl || product.imageUrl || '';
      const unit = product.unit || 'Unidad';
      const discount = Number(product.discountPercent || 0);
      return `
        <div class="col-sm-6 col-md-4 col-xl-3" data-admin-product-id="${esc(product.id)}">
          <div class="card h-100 ${product.active === false ? 'opacity-50' : ''}">
            <div class="card-img-wrap" style="height:140px;overflow:hidden">
              ${imageUrl
                ? `<img src="${esc(imageUrl)}" alt="${esc(product.name)}" loading="lazy" decoding="async" class="card-img-top h-100 w-100" style="object-fit:cover" onerror="this.parentElement.innerHTML='<div class=\\'d-flex align-items-center justify-content-center h-100 bg-secondary\\'><i class=\\'bi bi-image text-white display-5\\'></i></div>'">`
                : '<div class="d-flex align-items-center justify-content-center h-100 bg-secondary"><i class="bi bi-bag display-5 text-white"></i></div>'}
            </div>
            <div class="card-body p-2">
              <h6 class="card-title mb-1 small fw-bold">${esc(product.name)}</h6>
              <div class="d-flex justify-content-between align-items-center gap-2">
                <span class="text-primary fw-bold">${APP_CONFIG.currency} ${Number(product.price || 0).toFixed(2)}</span>
                <span class="badge ${product.active !== false ? 'bg-success' : 'bg-secondary'}">${product.active !== false ? 'Activo' : 'Inactivo'}</span>
              </div>
              <small class="text-muted d-block">Unidad: ${esc(unit)}</small>
              ${product.stock != null ? `<small class="text-muted d-block">Stock: ${Number(product.stock)}</small>` : ''}
              ${discount > 0 ? `<small class="text-danger d-block">Descuento: ${discount}%</small>` : ''}
            </div>
            <div class="card-footer p-2 d-flex gap-1">
              <button class="btn btn-outline-primary btn-sm flex-grow-1" onclick="Admin.editProduct('${product.id}')" aria-label="Editar ${esc(product.name)}"><i class="bi bi-pencil"></i></button>
              <button class="btn btn-outline-danger btn-sm flex-grow-1" onclick="Admin.deleteProduct('${product.id}')" aria-label="Eliminar ${esc(product.name)}"><i class="bi bi-trash"></i></button>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  function bindProductModal() {
    ensureProductImageUploadUi();
    document.getElementById('btnAddProduct')?.addEventListener('click', () => openProductModal(null));
    document.getElementById('productForm')?.addEventListener('submit', saveProduct);
    document.getElementById('productImageUrl')?.addEventListener('input', handleProductImageUrlInput);
    document.getElementById('productImageFile')?.addEventListener('change', handleProductImageSelection);
    document.getElementById('productImageDeleteBtn')?.addEventListener('click', () => void removeCurrentProductImage());
    document.getElementById('productImageUrlToggle')?.addEventListener('click', toggleImageUrlFallback);

    const dropzone = document.getElementById('productImageDropzone');
    const fileInput = document.getElementById('productImageFile');
    if (dropzone && fileInput) {
      dropzone.addEventListener('click', () => fileInput.click());
      dropzone.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          fileInput.click();
        }
      });
      ['dragenter', 'dragover'].forEach(name => dropzone.addEventListener(name, event => {
        event.preventDefault();
        event.stopPropagation();
        dropzone.classList.add('is-dragover');
      }));
      ['dragleave', 'dragend'].forEach(name => dropzone.addEventListener(name, event => {
        event.preventDefault();
        event.stopPropagation();
        dropzone.classList.remove('is-dragover');
      }));
      dropzone.addEventListener('drop', event => {
        event.preventDefault();
        event.stopPropagation();
        dropzone.classList.remove('is-dragover');
        const file = event.dataTransfer?.files?.[0] || null;
        if (file) void selectProductImageFile(file);
      });
    }
  }

  function ensureProductImageUploadUi() {
    const fileInput = document.getElementById('productImageFile');
    if (!fileInput) return;
    const uploadColumn = fileInput.closest('.col-12') || fileInput.parentElement;
    if (!uploadColumn || document.getElementById('productImageDropzone')) return;

    uploadColumn.innerHTML = `
      <label class="form-label fw-semibold mb-2">Imagen del producto</label>
      <div id="productImageDropzone" class="product-image-dropzone" role="button" tabindex="0" aria-controls="productImageFile" aria-label="Seleccionar imagen del producto">
        <i class="bi bi-cloud-upload product-image-dropzone-icon" aria-hidden="true"></i>
        <div class="fw-semibold mt-2">Arrastra una imagen aquí o haz clic para seleccionar</div>
        <small class="text-body-secondary mt-1">JPG, PNG, WEBP o GIF · máximo 5 MB</small>
      </div>
      <input type="file" id="productImageFile" class="d-none" accept="image/jpeg,image/png,image/webp,image/gif" />
      <div id="productImageUploadProgress" class="progress mt-2 d-none" role="progressbar" aria-label="Progreso de subida" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div id="productImageUploadProgressBar" class="progress-bar progress-bar-striped progress-bar-animated" style="width:0%">0%</div>
      </div>
      <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-2">
        <button type="button" id="productImageDeleteBtn" class="btn btn-outline-danger btn-sm d-none">
          <i class="bi bi-trash me-1"></i>Eliminar imagen
        </button>
        <button type="button" id="productImageUrlToggle" class="btn btn-link btn-sm p-0 ms-auto text-decoration-none">
          ¿Prefieres usar una URL?
        </button>
      </div>
      <div id="productImageUploadStatus" class="small mt-2" aria-live="polite"></div>`;

    const urlInput = document.getElementById('productImageUrl');
    const urlColumn = urlInput?.closest('.col-12');
    if (urlColumn) {
      urlColumn.id = 'productImageUrlFallback';
      urlColumn.classList.add('d-none');
      const label = urlColumn.querySelector('label');
      if (label) label.textContent = 'URL externa alternativa';
      urlInput.placeholder = 'https://ejemplo.com/imagen.jpg';
      urlInput.insertAdjacentHTML('afterend', '<div class="form-text">La URL debe ser pública y accesible mediante HTTP o HTTPS.</div>');
    }

    if (!document.getElementById('productImageStorageStyles')) {
      const style = document.createElement('style');
      style.id = 'productImageStorageStyles';
      style.textContent = `
        .product-image-dropzone {
          height: 140px;
          width: 100%;
          border: 2px dashed var(--accent, #f97316);
          border-radius: var(--bs-border-radius-lg, .5rem);
          background: rgba(var(--accent-rgb, 249, 115, 22), .08);
          color: var(--bs-body-color);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 1rem;
          cursor: pointer;
          transition: border-color .2s ease, background-color .2s ease, transform .2s ease;
        }
        .product-image-dropzone:hover,
        .product-image-dropzone:focus-visible,
        .product-image-dropzone.is-dragover {
          background: rgba(var(--accent-rgb, 249, 115, 22), .16);
          outline: none;
          transform: translateY(-1px);
        }
        .product-image-dropzone:focus-visible {
          box-shadow: 0 0 0 .25rem rgba(var(--accent-rgb, 249, 115, 22), .22);
        }
        .product-image-dropzone-icon {
          font-size: 2rem;
          color: var(--accent, #f97316);
          line-height: 1;
        }
        [data-bs-theme="dark"] .product-image-dropzone {
          background: rgba(var(--accent-rgb, 249, 115, 22), .12);
        }
        #productImageUploadProgress { height: 1.25rem; }
        #productImageUploadProgressBar { min-width: 2.5rem; }
        @media (max-width: 575.98px) {
          .product-image-dropzone { padding-inline: .75rem; }
          .product-image-dropzone-icon { font-size: 1.75rem; }
        }`;
      document.head.appendChild(style);
    }
  }

  function toggleImageUrlFallback() {
    const column = document.getElementById('productImageUrlFallback');
    const toggle = document.getElementById('productImageUrlToggle');
    if (!column) return;
    const willShow = column.classList.contains('d-none');
    column.classList.toggle('d-none', !willShow);
    if (toggle) toggle.textContent = willShow ? 'Ocultar URL alternativa' : '¿Prefieres usar una URL?';
    if (willShow) document.getElementById('productImageUrl')?.focus();
  }

  function setUrlFallbackVisible(visible) {
    const column = document.getElementById('productImageUrlFallback');
    const toggle = document.getElementById('productImageUrlToggle');
    column?.classList.toggle('d-none', !visible);
    if (toggle) toggle.textContent = visible ? 'Ocultar URL alternativa' : '¿Prefieres usar una URL?';
  }

  function setImageDeleteButtonVisible(visible) {
    document.getElementById('productImageDeleteBtn')?.classList.toggle('d-none', !visible);
  }

  function setProductImageStatus(message = '', type = 'body-secondary') {
    const status = document.getElementById('productImageUploadStatus');
    if (!status) return;
    status.className = `small mt-2 text-${type}`;
    status.textContent = message;
  }

  function setUploadProgress(percent, visible = true) {
    const wrapper = document.getElementById('productImageUploadProgress');
    const bar = document.getElementById('productImageUploadProgressBar');
    const safe = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    wrapper?.classList.toggle('d-none', !visible);
    wrapper?.setAttribute('aria-valuenow', String(safe));
    if (bar) {
      bar.style.width = `${safe}%`;
      bar.textContent = `${safe}%`;
      bar.classList.toggle('progress-bar-animated', safe < 100);
    }
  }

  function resetUploadProgress() {
    setUploadProgress(0, false);
    const bar = document.getElementById('productImageUploadProgressBar');
    bar?.classList.add('progress-bar-animated');
  }

  function setProductPreview(source) {
    const preview = document.getElementById('productImgPreview');
    const placeholder = document.getElementById('productImgPreviewEmpty');
    if (!preview) return;

    if (!source) {
      preview.removeAttribute('src');
      preview.style.display = 'none';
      if (placeholder) {
        placeholder.style.display = 'flex';
        placeholder.innerHTML = '<i class="bi bi-image me-2"></i>Vista previa de la imagen';
      }
      return;
    }

    preview.onload = () => {
      preview.style.display = 'block';
      if (placeholder) placeholder.style.display = 'none';
    };
    preview.onerror = () => {
      preview.style.display = 'none';
      if (placeholder) {
        placeholder.style.display = 'flex';
        placeholder.innerHTML = '<i class="bi bi-exclamation-triangle me-2"></i>No se pudo mostrar la imagen';
      }
    };
    preview.src = source;
  }

  function validateImageFile(file) {
    if (!file) throw new Error('Selecciona una imagen');
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_IMAGE_TYPES.has(file.type) || !ALLOWED_IMAGE_EXTENSIONS.has(extension)) {
      throw new Error('Tipo de archivo no permitido. Usa JPG, PNG, WEBP o GIF');
    }
    if (file.size > MAX_IMAGE_SIZE) throw new Error('La imagen no debe superar 5MB');
    if (file.size === 0) throw new Error('El archivo está vacío');
    return true;
  }

  function readImageAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener('load', () => resolve(String(reader.result || '')), { once: true });
      reader.addEventListener('error', () => reject(new Error('No se pudo leer la imagen seleccionada')), { once: true });
      reader.readAsDataURL(file);
    });
  }

  async function selectProductImageFile(file) {
    try {
      validateImageFile(file);
      selectedProductImageFile = file;
      imageRemovalRequested = false;
      const previewDataUrl = await readImageAsDataUrl(file);
      setProductPreview(previewDataUrl);
      setImageDeleteButtonVisible(true);
      setProductImageStatus(`${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB`, 'body-secondary');
      resetUploadProgress();
    } catch (error) {
      selectedProductImageFile = null;
      const fileInput = document.getElementById('productImageFile');
      if (fileInput) fileInput.value = '';
      setProductPreview(currentProductImageUrl);
      setImageDeleteButtonVisible(Boolean(currentProductImageUrl || currentProductImagePath));
      showToast(error.message, 'danger');
    }
  }

  async function handleProductImageSelection(event) {
    const file = event.target.files?.[0] || null;
    if (!file) {
      selectedProductImageFile = null;
      setProductPreview(currentProductImageUrl);
      return;
    }
    await selectProductImageFile(file);
  }

  function handleProductImageUrlInput(event) {
    const value = event.target.value.trim();
    if (value && selectedProductImageFile) {
      selectedProductImageFile = null;
      const fileInput = document.getElementById('productImageFile');
      if (fileInput) fileInput.value = '';
      resetUploadProgress();
    }
    imageRemovalRequested = false;
    setProductPreview(value || currentProductImageUrl);
    setImageDeleteButtonVisible(Boolean(value || currentProductImageUrl || currentProductImagePath));
  }

  function isFirebaseStorageUrl(url) {
    try {
      return Boolean(url) && new URL(url).hostname.includes('firebasestorage.googleapis.com');
    } catch (error) {
      return false;
    }
  }

  function isValidHttpUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (error) {
      return false;
    }
  }

  function uploadProductImage(file, productId) {
    validateImageFile(file);
    if (!window.storage) throw new Error('Firebase Storage no está inicializado');
    const ext = file.name.split('.').pop().toLowerCase();
    const path = `products/${productId || 'temp'}/${Date.now()}.${ext}`;
    const ref = window.storage.ref(path);
    return ref.put(file, { contentType: file.type });
  }

  window.uploadProductImage = uploadProductImage;

  function waitForUpload(task) {
    return new Promise((resolve, reject) => {
      task.on('state_changed', snapshot => {
        const progress = snapshot.totalBytes > 0
          ? (snapshot.bytesTransferred / snapshot.totalBytes) * 100
          : 0;
        setUploadProgress(progress, true);
        setProductImageStatus(`Subiendo imagen… ${Math.round(progress)}%`, 'body-secondary');
      }, reject, () => {
        setUploadProgress(100, true);
        resolve(task.snapshot);
      });
    });
  }

  async function deleteFirebaseStorageUrl(url) {
    if (!isFirebaseStorageUrl(url) || !window.storage) return;
    await window.storage.refFromURL(url).delete().catch(() => {});
  }

  async function deleteImagePath(path) {
    if (!path || !String(path).startsWith('products/') || !window.storage) return;
    await window.storage.ref(path).delete().catch(() => {});
    productImageUrlCache.delete(path);
  }

  async function cleanupPreviousImage(product, replacementUrl = null) {
    if (!product) return;
    if (product.imageUrl && product.imageUrl !== replacementUrl && isFirebaseStorageUrl(product.imageUrl)) {
      await deleteFirebaseStorageUrl(product.imageUrl);
    }
    if (product.imagePath) await deleteImagePath(product.imagePath);
  }

  async function removeCurrentProductImage() {
    const id = document.getElementById('productId')?.value || '';
    const product = id ? prods.find(item => item.id === id) : null;
    const hasPersistedImage = Boolean(product?.imageUrl || product?.imagePath || currentProductStoredImageUrl || currentProductImagePath);

    if (hasPersistedImage && !window.confirm('¿Eliminar la imagen actual del producto?')) return;

    const button = document.getElementById('productImageDeleteBtn');
    const originalHtml = button?.innerHTML;
    if (button) {
      button.disabled = true;
      button.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Eliminando';
    }

    try {
      if (id && hasPersistedImage) {
        await db.collection(COLL.products).doc(id).update({
          imageUrl: null,
          imagePath: null,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await cleanupPreviousImage(product || {
          imageUrl: currentProductStoredImageUrl,
          imagePath: currentProductImagePath
        });
      }

      selectedProductImageFile = null;
      currentProductImagePath = null;
      currentProductStoredImageUrl = null;
      currentProductImageUrl = null;
      imageRemovalRequested = true;
      const fileInput = document.getElementById('productImageFile');
      const urlInput = document.getElementById('productImageUrl');
      if (fileInput) fileInput.value = '';
      if (urlInput) urlInput.value = '';
      setProductPreview(null);
      resetUploadProgress();
      setProductImageStatus(id && hasPersistedImage ? 'Imagen eliminada' : '', id && hasPersistedImage ? 'success' : 'body-secondary');
      setImageDeleteButtonVisible(false);
    } catch (error) {
      showToast(`No se pudo eliminar la imagen: ${error.message}`, 'danger');
    } finally {
      if (button) {
        button.disabled = false;
        button.innerHTML = originalHtml;
      }
    }
  }

  function openProductModal(id) {
    const form = document.getElementById('productForm');
    if (!form) return;

    form.reset();
    selectedProductImageFile = null;
    currentProductImagePath = null;
    currentProductStoredImageUrl = null;
    currentProductImageUrl = null;
    imageRemovalRequested = false;
    document.getElementById('productId').value = '';
    document.getElementById('productModalTitle').textContent = id ? 'Editar Producto' : 'Nuevo Producto';
    document.getElementById('productActive').checked = true;
    document.getElementById('productUnit').value = 'Unidad';
    document.getElementById('productDiscount').value = '0';
    const fileInput = document.getElementById('productImageFile');
    if (fileInput) fileInput.value = '';
    setProductPreview(null);
    setProductImageStatus('');
    setImageDeleteButtonVisible(false);
    setUrlFallbackVisible(false);
    resetUploadProgress();
    populateCatSelect();

    if (id) {
      const product = prods.find(item => item.id === id);
      if (!product) return;

      document.getElementById('productId').value = product.id;
      document.getElementById('productName').value = product.name || '';
      document.getElementById('productDesc').value = product.description || '';
      document.getElementById('productPrice').value = product.price ?? '';
      document.getElementById('productStock').value = product.stock ?? '';
      document.getElementById('productUnit').value = product.unit || 'Unidad';
      document.getElementById('productDiscount').value = Number(product.discountPercent || 0);
      document.getElementById('productEmoji').value = product.emoji || '';
      document.getElementById('productActive').checked = product.active !== false;
      document.getElementById('productCategory').value = product.categoryId || '';
      fillSubcatSelect(product.categoryId, product.subcategoryId);

      currentProductImagePath = product.imagePath || null;
      currentProductStoredImageUrl = product.imageUrl || null;
      currentProductImageUrl = product.resolvedImageUrl || product.imageUrl || null;
      const externalUrl = product.imageUrl && !isFirebaseStorageUrl(product.imageUrl) ? product.imageUrl : '';
      document.getElementById('productImageUrl').value = externalUrl;
      setUrlFallbackVisible(Boolean(externalUrl));
      setProductPreview(currentProductImageUrl);
      setImageDeleteButtonVisible(Boolean(currentProductImageUrl || currentProductImagePath));
    }

    bootstrap.Modal.getOrCreateInstance(document.getElementById('productModal')).show();
  }

  async function saveProduct(event) {
    event.preventDefault();
    if (productSaveInProgress) return;
    productSaveInProgress = true;

    const id = document.getElementById('productId').value;
    const existingProduct = id ? prods.find(item => item.id === id) : null;
    const name = document.getElementById('productName').value.trim();
    const price = Number(document.getElementById('productPrice').value);
    const stockRaw = document.getElementById('productStock').value.trim();
    const discount = Number(document.getElementById('productDiscount').value || 0);
    const unit = document.getElementById('productUnit').value || 'Unidad';
    const enteredImageUrl = document.getElementById('productImageUrl').value.trim();

    if (!name) {
      showToast('El nombre es obligatorio', 'danger');
      productSaveInProgress = false;
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      showToast('Precio inválido', 'danger');
      productSaveInProgress = false;
      return;
    }
    if (stockRaw !== '' && (!Number.isInteger(Number(stockRaw)) || Number(stockRaw) < 0)) {
      showToast('Stock inválido', 'danger');
      productSaveInProgress = false;
      return;
    }
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
      showToast('El descuento debe estar entre 0 y 100', 'danger');
      productSaveInProgress = false;
      return;
    }
    if (!selectedProductImageFile && enteredImageUrl && !isValidHttpUrl(enteredImageUrl)) {
      showToast('La URL de imagen debe usar HTTP o HTTPS', 'danger');
      productSaveInProgress = false;
      return;
    }

    const button = event.submitter;
    const originalButtonHtml = button?.innerHTML;
    if (button) {
      button.disabled = true;
      button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Guardando';
    }

    const productReference = id
      ? db.collection(COLL.products).doc(id)
      : db.collection(COLL.products).doc();
    let uploadedImageUrl = null;

    try {
      const data = {
        name,
        description: document.getElementById('productDesc').value.trim(),
        emoji: document.getElementById('productEmoji').value.trim() || null,
        price,
        stock: stockRaw === '' ? null : Number(stockRaw),
        unit,
        discountPercent: discount,
        categoryId: document.getElementById('productCategory').value || null,
        subcategoryId: document.getElementById('productSubcat').value || null,
        active: document.getElementById('productActive').checked,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      if (selectedProductImageFile) {
        const task = uploadProductImage(selectedProductImageFile, productReference.id);
        const snapshot = await waitForUpload(task);
        uploadedImageUrl = await snapshot.ref.getDownloadURL();
        data.imageUrl = uploadedImageUrl;
        data.imagePath = null;
      } else if (enteredImageUrl) {
        data.imageUrl = enteredImageUrl;
        data.imagePath = null;
      } else if (imageRemovalRequested) {
        data.imageUrl = null;
        data.imagePath = null;
      } else if (id) {
        data.imageUrl = existingProduct?.imageUrl || null;
        data.imagePath = existingProduct?.imagePath || null;
      } else {
        data.imageUrl = null;
        data.imagePath = null;
      }

      if (id) {
        await productReference.update(data);
      } else {
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await productReference.set(data);
      }

      const imageChanged = Boolean(selectedProductImageFile)
        || Boolean(enteredImageUrl && enteredImageUrl !== (existingProduct?.imageUrl || ''))
        || imageRemovalRequested;
      if (id && imageChanged) await cleanupPreviousImage(existingProduct, data.imageUrl);

      if (uploadedImageUrl) {
        setProductImageStatus('Imagen subida correctamente a Firebase Storage', 'success');
      }
      showToast(id ? 'Producto actualizado' : 'Producto creado', 'success');
      bootstrap.Modal.getInstance(document.getElementById('productModal'))?.hide();
      selectedProductImageFile = null;
    } catch (error) {
      if (uploadedImageUrl) await deleteFirebaseStorageUrl(uploadedImageUrl);
      showToast(`No se pudo guardar el producto: ${error.message}`, 'danger');
    } finally {
      productSaveInProgress = false;
      if (button) {
        button.disabled = false;
        button.innerHTML = originalButtonHtml;
      }
    }
  }

  function editProduct(id) {
    openProductModal(id);
  }

  async function deleteProduct(id) {
    const product = prods.find(item => item.id === id);
    if (!window.confirm(`¿Eliminar "${product?.name || 'producto'}"?`)) return;

    try {
      if (product?.imageUrl?.includes('firebasestorage.googleapis.com') && window.storage) {
        await window.storage.refFromURL(product.imageUrl).delete().catch(() => {});
      }
      if (product?.imagePath) await deleteImagePath(product.imagePath);
      await db.collection(COLL.products).doc(id).delete();
      showToast('Producto eliminado', 'info');
    } catch (error) {
      showToast(`No se pudo eliminar el producto: ${error.message}`, 'danger');
    }
  }

  function bindProductsTemplateEnhancement() {
    document.addEventListener('click', event => {
      const button = event.target.closest?.('#downloadProductsTemplateBtn');
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void downloadProductsTemplateWithStorageNote();
    }, true);
  }

  function loadScript(source, globalName) {
    if (globalName && window[globalName]) return Promise.resolve(window[globalName]);
    return new Promise((resolve, reject) => {
      const existing = [...document.scripts].find(script => script.src === source);
      if (existing) {
        existing.addEventListener('load', () => resolve(globalName ? window[globalName] : true), { once: true });
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

  async function downloadProductsTemplateWithStorageNote() {
    try {
      await loadScript(XLSX_CDN, 'XLSX');
      if (!window.XLSX) throw new Error('SheetJS no está disponible');
      const main = cats.find(category => !category.parentId);
      const sub = cats.find(category => category.parentId === main?.id) || cats.find(category => category.parentId);
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
      const headers = ['nombre', 'descripcion', 'precio', 'stock', 'categoria', 'subcategoria', 'imageUrl', 'activo'];
      const sheet = window.XLSX.utils.json_to_sheet(rows, { header: headers });
      sheet['!cols'] = [{ wch: 30 }, { wch: 45 }, { wch: 12 }, { wch: 12 }, { wch: 24 }, { wch: 24 }, { wch: 45 }, { wch: 10 }];
      if (sheet.G1) {
        sheet.G1.c = [{
          a: 'Kiosco',
          t: 'Las URLs de imageUrl deben ser públicas y accesibles por HTTP/HTTPS. Las URLs externas se mantienen como están y no se descargan ni se vuelven a subir durante la importación.'
        }];
      }
      const instructions = window.XLSX.utils.aoa_to_sheet([
        ['IMPORTACIÓN DE PRODUCTOS - NOTAS'],
        ['Campo', 'Regla'],
        ['imageUrl', 'Usa una URL pública y accesible por HTTP o HTTPS.'],
        ['imageUrl', 'Las URLs externas se conservan sin descargar ni re-subir a Firebase Storage.'],
        ['Imágenes nuevas', 'Para subir archivos a Firebase Storage usa el formulario de creación/edición de producto del panel administrador.'],
        ['Formatos de subida', 'JPG/JPEG, PNG, WEBP o GIF; máximo 5 MB.']
      ]);
      instructions['!cols'] = [{ wch: 22 }, { wch: 95 }];
      const workbook = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(workbook, sheet, 'Productos');
      window.XLSX.utils.book_append_sheet(workbook, instructions, 'INSTRUCCIONES');
      window.XLSX.writeFile(workbook, 'plantilla-importacion-productos.xlsx', { compression: true });
      showToast('Plantilla descargada', 'success');
    } catch (error) {
      console.error('Plantilla Excel:', error);
      showToast(`No se pudo generar la plantilla: ${error.message}`, 'danger');
    }
  }

  // Categorías
  function renderCategories() {
    const el = document.getElementById('categoriesTable');
    if (!el) return;
    const mains = cats.filter(c => !c.parentId), subs = cats.filter(c => c.parentId);
    if (!mains.length) { el.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">Sin categorías</td></tr>'; return; }
    el.innerHTML = mains.map(m => {
      const ch = subs.filter(s => s.parentId === m.id);
      return `<tr>
        <td><i class="bi bi-tag me-2"></i>${esc(m.name)}</td>
        <td>${m.emoji || '—'}</td>
        <td><span class="badge bg-info">${ch.length} subcat.</span>${ch.map(s => `<span class="badge bg-secondary ms-1">${esc(s.name)}</span>`).join('')}</td>
        <td>
          <button class="btn btn-outline-primary btn-sm me-1" onclick="Admin.editCat('${m.id}')"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-outline-danger btn-sm" onclick="Admin.deleteCat('${m.id}')"><i class="bi bi-trash"></i></button>
        </td>
      </tr>${ch.map(s => `<tr class="table-secondary">
        <td class="ps-4"><i class="bi bi-arrow-return-right me-2 text-muted"></i>${esc(s.name)}</td>
        <td>${s.emoji || '—'}</td><td></td>
        <td>
          <button class="btn btn-outline-primary btn-sm me-1" onclick="Admin.editCat('${s.id}')"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-outline-danger btn-sm" onclick="Admin.deleteCat('${s.id}')"><i class="bi bi-trash"></i></button>
        </td></tr>`).join('')}`;
    }).join('');
  }

  function bindCategoryModal() {
    document.getElementById('btnAddCat')?.addEventListener('click', () => openCatModal(null, false));
    document.getElementById('btnAddSubcat')?.addEventListener('click', () => openCatModal(null, true));
    document.getElementById('catForm')?.addEventListener('submit', saveCat);
  }

  function openCatModal(id, forceSubcat = false) {
    const form = document.getElementById('catForm'); if (!form) return;
    form.reset(); document.getElementById('catId').value = '';
    populateParentSelect(id);
    document.getElementById('catModalTitle').textContent = id ? (cats.find(c => c.id === id)?.parentId ? 'Editar Subcategoría' : 'Editar Categoría') : (forceSubcat ? 'Nueva Subcategoría' : 'Nueva Categoría');
    if (id) { const c = cats.find(x => x.id === id); if (!c) return; document.getElementById('catId').value = c.id; document.getElementById('catName').value = c.name || ''; document.getElementById('catEmoji').value = c.emoji || ''; setTimeout(() => document.getElementById('catParent').value = c.parentId || '', 30); }
    else if (forceSubcat && cats.filter(c => !c.parentId).length) { setTimeout(() => document.getElementById('catParent').value = cats.filter(c => !c.parentId)[0].id, 30); }
    new bootstrap.Modal(document.getElementById('catModal')).show();
  }

  async function saveCat(e) {
    e.preventDefault();
    const id = document.getElementById('catId').value;
    const data = { name: document.getElementById('catName').value.trim(), emoji: document.getElementById('catEmoji').value.trim() || null, parentId: document.getElementById('catParent').value || null, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    if (!data.name) { showToast('Nombre requerido', 'danger'); return; }
    try {
      if (id) { await db.collection(COLL.categories).doc(id).update(data); showToast('Actualizado', 'success'); }
      else { data.createdAt = firebase.firestore.FieldValue.serverTimestamp(); await db.collection(COLL.categories).add(data); showToast((data.parentId ? 'Subcategoría' : 'Categoría') + ' creada', 'success'); }
      bootstrap.Modal.getInstance(document.getElementById('catModal'))?.hide();
    } catch (err) { showToast('Error: ' + err.message, 'danger'); }
  }

  function editCat(id) { openCatModal(id, false); }
  async function deleteCat(id) {
    const c = cats.find(x => x.id === id), subs = cats.filter(x => x.parentId === id);
    if (!confirm(`¿Eliminar "${c?.name}"?${subs.length ? ' También sus ' + subs.length + ' subcategorías.' : ''}`)) return;
    const batch = db.batch(); batch.delete(db.collection(COLL.categories).doc(id)); subs.forEach(s => batch.delete(db.collection(COLL.categories).doc(s.id)));
    try { await batch.commit(); showToast('Eliminado', 'info'); } catch (e) { showToast('Error: ' + e.message, 'danger'); }
  }

  function populateCatSelect() {
    const sel = document.getElementById('productCategory'); if (!sel) return;
    const cur = sel.value; sel.innerHTML = '<option value="">Sin categoría</option>' + cats.filter(c => !c.parentId).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join(''); if (cur) sel.value = cur;
    sel.onchange = () => fillSubcatSelect(sel.value, null);
  }
  function fillSubcatSelect(parentId, selectedId) {
    const sel = document.getElementById('productSubcat'); if (!sel) return;
    const subs = parentId ? cats.filter(c => c.parentId === parentId) : [];
    sel.innerHTML = '<option value="">Sin subcategoría</option>' + subs.map(c => `<option value="${c.id}"${c.id === selectedId ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
  }
  function populateParentSelect(excludeId) {
    const sel = document.getElementById('catParent'); if (!sel) return;
    sel.innerHTML = '<option value="">— Categoría principal —</option>' + cats.filter(c => !c.parentId && c.id !== excludeId).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  }

  // Caja
  function renderCaja() {
    const el = document.getElementById('cajaContent'); if (!el) return;
    const KEY = 'kk_caja_' + new Date().toISOString().slice(0, 10);
    const state = JSON.parse(localStorage.getItem(KEY) || 'null');
    const isOpen = state?.status === 'open';
    el.innerHTML = `
      <div class="row g-3 mb-4">
        <div class="col-4"><div class="card text-center p-3"><div class="h5 mb-1 text-muted">Apertura</div><div class="h3 fw-bold">${APP_CONFIG.currency} ${(state?.initial || 0).toFixed(2)}</div></div></div>
        <div class="col-4"><div class="card text-center p-3"><div class="h5 mb-1 text-muted">Ventas</div><div class="h3 fw-bold text-success" id="cajaSales">...</div></div></div>
        <div class="col-4"><div class="card text-center p-3"><div class="h5 mb-1 text-muted">Total</div><div class="h3 fw-bold text-primary" id="cajaTotal">...</div></div></div>
      </div>
      <div class="d-flex align-items-center gap-3 mb-4">
        <span class="badge ${isOpen ? 'bg-success' : 'bg-danger'} fs-6 px-3 py-2"><i class="bi bi-circle-fill me-2"></i>${isOpen ? 'Caja Abierta' : 'Caja Cerrada'}</span>
        ${state?.openedAt ? `<small class="text-muted">Apertura: ${new Date(state.openedAt).toLocaleTimeString('es-PE')}</small>` : ''}
      </div>
      ${isOpen ? `
        <div class="row g-2 align-items-end">
          <div class="col-md-6"><label class="form-label">Monto final contado</label><input type="number" class="form-control" id="cajaFinal" min="0" step="0.50" placeholder="S/ 0.00"></div>
          <div class="col-md-3"><button class="btn btn-danger w-100" id="btnCerrarCaja"><i class="bi bi-lock me-2"></i>Cerrar Caja</button></div>
        </div>
        ${state?.closedAt ? `<p class="mt-3 text-muted small">Cerrada: ${new Date(state.closedAt).toLocaleString('es-PE')} — Final: ${APP_CONFIG.currency} ${(state.final || 0).toFixed(2)}</p>` : ''}` : `
        <div class="row g-2 align-items-end">
          <div class="col-md-6"><label class="form-label">Monto de apertura</label><input type="number" class="form-control" id="cajaInicial" min="0" step="0.50" placeholder="S/ 0.00"></div>
          <div class="col-md-3"><button class="btn btn-success w-100" id="btnAbrirCaja"><i class="bi bi-unlock me-2"></i>Abrir Caja</button></div>
        </div>`}
      <div id="cajaDayOrders" class="mt-4"></div>`;

    document.getElementById('btnAbrirCaja')?.addEventListener('click', () => {
      const init = parseFloat(document.getElementById('cajaInicial')?.value) || 0;
      localStorage.setItem(KEY, JSON.stringify({ status: 'open', openedAt: new Date().toISOString(), initial: init }));
      showToast('Caja abierta', 'success'); renderCaja();
    });
    document.getElementById('btnCerrarCaja')?.addEventListener('click', () => {
      const final = parseFloat(document.getElementById('cajaFinal')?.value) || 0;
      const cur = JSON.parse(localStorage.getItem(KEY) || '{}');
      localStorage.setItem(KEY, JSON.stringify({ ...cur, status: 'closed', closedAt: new Date().toISOString(), final }));
      showToast('Caja cerrada', 'info'); renderCaja();
    });
    loadCajaSales(state);
  }

  async function loadCajaSales(state) {
    try {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const snap = await db.collection(COLL.orders).get();
      const orders = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(o => {
        const t = o.createdAt?.toDate?.() || new Date(0); return t >= today && o.status !== 'rejected';
      });
      const sales = orders.reduce((s, o) => s + (o.total || 0), 0);
      const init = state?.initial || 0;
      document.getElementById('cajaSales').textContent = `${APP_CONFIG.currency} ${sales.toFixed(2)}`;
      document.getElementById('cajaTotal').textContent = `${APP_CONFIG.currency} ${(init + sales).toFixed(2)}`;
      const listEl = document.getElementById('cajaDayOrders');
      if (listEl && orders.length) {
        listEl.innerHTML = `<h6 class="mb-3">Pedidos del día (${orders.length})</h6><div class="list-group">` + orders.slice(0, 10).map(o => `<div class="list-group-item list-group-item-action d-flex justify-content-between"><span>${o.customer || 'Cliente'}</span><strong>${APP_CONFIG.currency} ${(o.total || 0).toFixed(2)}</strong></div>`).join('') + '</div>';
      }
    } catch (e) { console.warn('caja sales:', e.message); }
  }

  // Horario
  async function loadSchedule() {
    const el = document.getElementById('scheduleContent'); if (!el) return;
    const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    let sch = [];
    try { const doc = await db.collection(COLL.config).doc('settings').get(); if (doc.exists) sch = doc.data().schedule || []; } catch (e) { console.warn(e); }
    const def = { open: true, from: '08:00', to: '20:00' };
    const data = DAYS.map((_, i) => sch[i] || { ...def });
    el.innerHTML = `<div class="table-responsive"><table class="table table-sm align-middle">
      <thead><tr><th>Día</th><th>Abierto</th><th>Desde</th><th>Hasta</th></tr></thead>
      <tbody>${DAYS.map((d, i) => `<tr>
        <td class="fw-semibold">${d}</td>
        <td><div class="form-check form-switch mb-0"><input class="form-check-input day-toggle" type="checkbox" id="dayOpen${i}" ${data[i].open ? 'checked' : ''}></div></td>
        <td><input type="time" class="form-control form-control-sm day-from" id="dayFrom${i}" value="${data[i].from}" ${!data[i].open ? 'disabled' : ''}></td>
        <td><input type="time" class="form-control form-control-sm day-to" id="dayTo${i}" value="${data[i].to}" ${!data[i].open ? 'disabled' : ''}></td>
      </tr>`).join('')}</tbody></table></div>
      <button class="btn btn-primary mt-3" id="btnSaveSchedule"><i class="bi bi-save me-2"></i>Guardar Horario</button>`;

    DAYS.forEach((_, i) => document.getElementById('dayOpen' + i)?.addEventListener('change', e => {
      document.getElementById('dayFrom' + i).disabled = !e.target.checked;
      document.getElementById('dayTo' + i).disabled = !e.target.checked;
    }));
    document.getElementById('btnSaveSchedule')?.addEventListener('click', async () => {
      const newSch = DAYS.map((_, i) => ({ open: document.getElementById('dayOpen' + i)?.checked || false, from: document.getElementById('dayFrom' + i)?.value || '08:00', to: document.getElementById('dayTo' + i)?.value || '20:00' }));
      try { await db.collection(COLL.config).doc('settings').set({ schedule: newSch }, { merge: true }); showToast('Horario guardado', 'success'); }
      catch (e) { showToast('Error: ' + e.message, 'danger'); }
    });
  }

  // Personal
  function bindStaffModal() {
    document.getElementById('btnAddStaff')?.addEventListener('click', () => openStaffModal());
    document.getElementById('staffForm')?.addEventListener('submit', saveStaff);
  }

  async function renderStaff() {
    const el = document.getElementById('staffTable'); if (!el) return;
    try { const doc = await db.collection(COLL.config).doc('staff').get(); staffCache = doc.exists ? doc.data().members || [] : []; } catch (e) { staffCache = []; }
    if (!staffCache.length) { el.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">Sin personal</td></tr>'; return; }
    el.innerHTML = staffCache.map((m, i) => `<tr>
      <td>${esc(m.name || 'Sin nombre')}</td>
      <td>${esc(m.phone)}</td>
      <td><span class="badge ${m.role === 'admin' ? 'bg-warning text-dark' : 'bg-info'}">${m.role === 'admin' ? 'Admin' : 'Empleado'}</span></td>
      <td><button class="btn btn-outline-danger btn-sm" onclick="Admin.removeStaff(${i})"><i class="bi bi-trash"></i></button></td>
    </tr>`).join('');
  }

  function openStaffModal() {
    document.getElementById('staffForm')?.reset();
    new bootstrap.Modal(document.getElementById('staffModal')).show();
  }

  async function saveStaff(e) {
    e.preventDefault();
    const name = document.getElementById('staffName').value.trim();
    const phone = '+51' + document.getElementById('staffPhone').value.replace(/\D/g, '');
    const role = document.getElementById('staffRole').value;
    if (!phone || phone.length < 12) { showToast('Teléfono inválido', 'danger'); return; }
    if (staffCache.find(m => m.phone === phone)) { showToast('Ya registrado', 'warning'); return; }
    staffCache.push({ name, phone, role });
    try { await db.collection(COLL.config).doc('staff').set({ members: staffCache }, { merge: true }); showToast('Personal agregado', 'success'); bootstrap.Modal.getInstance(document.getElementById('staffModal'))?.hide(); renderStaff(); }
    catch (er) { showToast('Error: ' + er.message, 'danger'); }
  }

  async function removeStaff(idx) {
    if (!confirm('¿Eliminar?')) return;
    staffCache.splice(idx, 1);
    try { await db.collection(COLL.config).doc('staff').set({ members: staffCache }, { merge: true }); showToast('Eliminado', 'info'); renderStaff(); }
    catch (e) { showToast('Error: ' + e.message, 'danger'); }
  }

  // Apariencia
  async function loadBranding() {
    const el = document.getElementById('brandingForm'); if (!el) return;
    try {
      const doc = await db.collection(COLL.config).doc('theme').get();
      if (doc.exists) {
        const d = doc.data();
        document.getElementById('brandName').value = d.storeName || '';
        document.getElementById('brandEmoji').value = d.storeEmoji || '';
        document.getElementById('brandColor').value = d.accentColor || '#f97316';
        document.getElementById('brandLogoUrl').value = d.storeLogoUrl || '';
        document.getElementById('brandEta').value = d.etaMinutes || '';
        if (d.accentColor) applyColor(d.accentColor);
        if (d.storeName) { const lt = document.querySelector('.logo-text'); if (lt) lt.textContent = d.storeName; }
        if (d.storeLogoUrl) { const li = document.querySelector('.logo-icon'); if (li) li.innerHTML = `<img src="${d.storeLogoUrl}" style="width:32px;height:32px;border-radius:6px;object-fit:cover">`; }
      }
    } catch (e) { console.warn('branding:', e); }
    document.getElementById('brandingForm')?.addEventListener('submit', saveBranding, { once: true });
    document.getElementById('brandColor')?.addEventListener('input', e => applyColor(e.target.value));
  }

  async function saveBranding(e) {
    e.preventDefault();
    const data = { storeName: document.getElementById('brandName').value.trim(), storeEmoji: document.getElementById('brandEmoji').value.trim(), accentColor: document.getElementById('brandColor').value, storeLogoUrl: document.getElementById('brandLogoUrl').value.trim() || null, etaMinutes: parseInt(document.getElementById('brandEta').value) || null, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    try {
      await db.collection(COLL.config).doc('theme').set(data, { merge: true });
      applyColor(data.accentColor);
      if (data.storeName) { const lt = document.querySelector('.logo-text'); if (lt) lt.textContent = data.storeName; }
      if (data.storeLogoUrl) { const li = document.querySelector('.logo-icon'); if (li) li.innerHTML = `<img src="${data.storeLogoUrl}" style="width:32px;height:32px;border-radius:6px;object-fit:cover">`; }
      showToast('Apariencia guardada', 'success');
      document.getElementById('brandingForm')?.addEventListener('submit', saveBranding, { once: true });
    } catch (er) { showToast('Error: ' + er.message, 'danger'); }
  }

  function applyColor(color) {
    const style = document.getElementById('accentStyle') || Object.assign(document.createElement('style'), { id: 'accentStyle' });
    if (!style.parentNode) document.head.appendChild(style);
    const r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
    style.textContent = `:root{--accent:${color};--accent-rgb:${r},${g},${b};}`;
  }

  function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#039;'); }

  // KIOSCO_NINE:ADMIN_LOCAL_DATA
  function getProducts() { return prods.map(product => ({ ...product })); }
  function getCategories() { return cats.map(category => ({ ...category })); }

  return { init, editProduct, deleteProduct, editCat, deleteCat, removeStaff, getProducts, getCategories };
})();
