// js/admin.js — Admin CRUD: products, categories, caja, horario, personal, apariencia
const Admin = (() => {
  let prods = [], cats = [], unsubP = null, unsubC = null, ready = false, staffCache = [];

  function init() {
    if (ready) return;
    ready = true;
    subscribeAll();
    bindNav();
    bindProductModal();
    bindCategoryModal();
    bindStaffModal();
    loadBranding();
    loadSchedule();
  }

  function subscribeAll() {
    unsubC = db.collection(COLL.categories).onSnapshot(snap => {
      cats = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'));
      renderCategories(); populateCatSelect();
    }, e => console.warn('cats:', e.code));
    unsubP = db.collection(COLL.products).onSnapshot(snap => {
      prods = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'));
      renderProducts();
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

  // ── PRODUCTS ──────────────────────────────────────────────────────────────
  function renderProducts() {
    const grid = document.getElementById('adminProductsGrid');
    if (!grid) return;
    if (!prods.length) { grid.innerHTML = `<div class="col-12 text-center py-5"><i class="bi bi-box display-4 text-muted"></i><p class="mt-3 text-muted">Sin productos</p></div>`; return; }
    grid.innerHTML = prods.map(p => `
      <div class="col-sm-6 col-md-4 col-xl-3">
        <div class="card h-100 ${!p.active ? 'opacity-50' : ''}">
          <div class="card-img-wrap" style="height:140px;overflow:hidden">
            ${p.imageUrl ? `<img src="${p.imageUrl}" class="card-img-top h-100 w-100" style="object-fit:cover" onerror="this.parentElement.innerHTML='<div class=\\'d-flex align-items-center justify-content-center h-100 bg-secondary\\'><i class=\\'bi bi-image text-white display-5\\'></i></div>'">`
        : `<div class="d-flex align-items-center justify-content-center h-100 bg-secondary"><i class="bi bi-bag display-5 text-white"></i></div>`}
          </div>
          <div class="card-body p-2">
            <h6 class="card-title mb-1 small fw-bold">${esc(p.name)}</h6>
            <div class="d-flex justify-content-between align-items-center">
              <span class="text-primary fw-bold">${APP_CONFIG.currency} ${Number(p.price).toFixed(2)}</span>
              <span class="badge ${p.active ? 'bg-success' : 'bg-secondary'}">${p.active ? 'Activo' : 'Inactivo'}</span>
            </div>
            ${p.stock != null ? `<small class="text-muted">Stock: ${p.stock}</small>` : ''}
          </div>
          <div class="card-footer p-2 d-flex gap-1">
            <button class="btn btn-outline-primary btn-sm flex-grow-1" onclick="Admin.editProduct('${p.id}')"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-outline-danger btn-sm flex-grow-1" onclick="Admin.deleteProduct('${p.id}')"><i class="bi bi-trash"></i></button>
          </div>
        </div>
      </div>`).join('');
  }

  function bindProductModal() {
    document.getElementById('btnAddProduct')?.addEventListener('click', () => openProductModal(null));
    document.getElementById('productForm')?.addEventListener('submit', saveProduct);
    document.getElementById('productImageUrl')?.addEventListener('input', e => {
      const prev = document.getElementById('productImgPreview');
      if (prev) prev.src = e.target.value;
    });
  }

  function openProductModal(id) {
    const form = document.getElementById('productForm');
    if (!form) return;
    form.reset();
    document.getElementById('productId').value = '';
    document.getElementById('productModalTitle').textContent = id ? 'Editar Producto' : 'Nuevo Producto';
    document.getElementById('productActive').checked = true;
    const prev = document.getElementById('productImgPreview'); if (prev) prev.src = '';
    populateCatSelect();
    if (id) {
      const p = prods.find(x => x.id === id); if (!p) return;
      document.getElementById('productId').value = p.id;
      document.getElementById('productName').value = p.name || '';
      document.getElementById('productDesc').value = p.description || '';
      document.getElementById('productPrice').value = p.price ?? '';
      document.getElementById('productStock').value = p.stock ?? '';
      document.getElementById('productEmoji').value = p.emoji || '';
      document.getElementById('productImageUrl').value = p.imageUrl || '';
      document.getElementById('productActive').checked = !!p.active;
      document.getElementById('productCategory').value = p.categoryId || '';
      fillSubcatSelect(p.categoryId, p.subcategoryId);
      if (prev && p.imageUrl) prev.src = p.imageUrl;
    }
    const modal = document.getElementById('productModal');
    new bootstrap.Modal(modal).show();
  }

  async function saveProduct(e) {
    e.preventDefault();
    const id = document.getElementById('productId').value;
    const price = parseFloat(document.getElementById('productPrice').value);
    if (isNaN(price) || price < 0) { showToast('Precio inválido', 'danger'); return; }
    const stockRaw = document.getElementById('productStock').value;
    const data = {
      name: document.getElementById('productName').value.trim(),
      description: document.getElementById('productDesc').value.trim(),
      emoji: document.getElementById('productEmoji').value.trim() || null,
      price, stock: stockRaw !== '' ? parseInt(stockRaw) : null,
      categoryId: document.getElementById('productCategory').value || null,
      subcategoryId: document.getElementById('productSubcat').value || null,
      imageUrl: document.getElementById('productImageUrl').value.trim() || null,
      active: document.getElementById('productActive').checked,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    const btn = e.submitter; if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>'; }
    try {
      if (id) { await db.collection(COLL.products).doc(id).update(data); showToast('Producto actualizado', 'success'); }
      else { data.createdAt = firebase.firestore.FieldValue.serverTimestamp(); await db.collection(COLL.products).add(data); showToast('Producto creado', 'success'); }
      bootstrap.Modal.getInstance(document.getElementById('productModal'))?.hide();
    } catch (err) { showToast('Error: ' + err.message, 'danger'); }
    finally { if (btn) { btn.disabled = false; btn.innerHTML = 'Guardar'; } }
  }

  function editProduct(id) { openProductModal(id); }

  async function deleteProduct(id) {
    const p = prods.find(x => x.id === id);
    if (!confirm(`¿Eliminar "${p?.name || 'producto'}"?`)) return;
    try { await db.collection(COLL.products).doc(id).delete(); showToast('Eliminado', 'info'); }
    catch (e) { showToast('Error: ' + e.message, 'danger'); }
  }

  // ── CATEGORIES ────────────────────────────────────────────────────────────
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

  // ── CAJA ────────────────────────────────────────────────────────────────
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

  // ── HORARIO ────────────────────────────────────────────────────────────
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

  // ── PERSONAL ────────────────────────────────────────────────────────────
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

  // ── BRANDING ────────────────────────────────────────────────────────────
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

  function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  return { init, editProduct, deleteProduct, editCat, deleteCat, removeStaff };
})();
