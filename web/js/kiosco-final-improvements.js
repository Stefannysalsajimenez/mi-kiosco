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
