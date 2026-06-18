const Admin = (() => {
  let prods = [], cats = [], ready = false, staffCache = [];
  function init() { if (ready) return; ready = true; subscribeAll(); bindNav(); bindProductModal(); bindCategoryModal(); bindStaffModal(); loadBranding(); }
  function subscribeAll() {
    db.collection(COLL.categories).orderBy('name').onSnapshot(snap => { cats = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderCats(); fillCatSelect(); });
    db.collection(COLL.products).orderBy('name').onSnapshot(snap => { prods = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderProds(); });
  }
  function bindNav() {
    document.querySelectorAll('.admin-nav-btn[data-section]').forEach(btn => btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active');
      const s = btn.dataset.section; document.querySelectorAll('.admin-section').forEach(el => el.classList.remove('active'));
      const sec = document.getElementById('section' + s[0].toUpperCase() + s.slice(1)); if (sec) sec.classList.add('active');
      if (s === 'dashboard') Dashboard.refresh(); if (s === 'orders') Orders.init();
      if (s === 'cashregister') renderCaja(); if (s === 'schedule') renderSchedule();
      if (s === 'staff') renderStaff(); if (s === 'branding') renderBranding();
    }));
    document.getElementById('backToStoreBtn')?.addEventListener('click', () => App.showPage('store'));
    document.getElementById('logoutBtn')?.addEventListener('click', () => { if (confirm('¿Cerrar sesión?')) Auth.signOut().then(() => { App.showPage('store'); showToast('Sesión cerrada', 'info'); }); });
  }
  function e(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // PRODUCTOS
  function renderProds() {
    const grid = document.getElementById('adminProductsGrid'); if (!grid) return;
    if (!prods.length) { grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">📦</div><p>No hay productos aún.</p></div>`; return; }
    grid.innerHTML = prods.map(p => `<div class="admin-product-card ${p.active ? '' : 'admin-product-inactive'}"><div class="admin-product-img">${p.imageUrl ? `<img src="${e(p.imageUrl)}" alt="${e(p.name)}" loading="lazy"/>` : `<span style="font-size:3rem">${p.emoji || '🛍️'}</span>`}${p.featured ? '<span class="featured-badge">⭐</span>' : ''}</div><div class="admin-product-info"><p class="admin-product-name">${e(p.name)}</p><p class="admin-product-price">${APP_CONFIG.currency} ${Number(p.price).toFixed(2)}</p><p style="font-size:.72rem;color:var(--text-3);margin-top:.2rem">${p.active ? '✅ Visible' : '❌ Oculto'} · ${p.stock != null ? 'Stock: ' + p.stock : 'Sin límite'}</p></div><div class="admin-product-actions"><button class="btn-outline btn-sm" data-edit="${p.id}">✏️ Editar</button><button class="btn-danger btn-sm" data-del="${p.id}">🗑️</button></div></div>`).join('');
    grid.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => openProductModal(btn.dataset.edit)));
    grid.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', () => delProduct(btn.dataset.del)));
  }
  function bindProductModal() {
    document.getElementById('addProductBtn')?.addEventListener('click', () => openProductModal(null));
    document.getElementById('closeProductModal')?.addEventListener('click', closeProductModal);
    document.getElementById('cancelProductBtn')?.addEventListener('click', closeProductModal);
    document.getElementById('productModal')?.addEventListener('click', ev => { if (ev.target.id === 'productModal') closeProductModal(); });
    document.getElementById('productCategory')?.addEventListener('change', ev => fillSubSelect(ev.target.value, null));
    let timer; document.getElementById('productImage')?.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { const url = document.getElementById('productImage')?.value.trim(); const prev = document.getElementById('productImagePreview'); if (!prev) return; if (url) { prev.src = url; prev.style.display = 'block'; prev.onerror = () => prev.style.display = 'none'; } else prev.style.display = 'none'; }, 600); });
    document.getElementById('productForm')?.addEventListener('submit', saveProduct);
  }
  function openProductModal(id) {
    document.getElementById('productForm')?.reset(); document.getElementById('productId').value = ''; document.getElementById('productActive').checked = true;
    const prev = document.getElementById('productImagePreview'); if (prev) prev.style.display = 'none';
    fillCatSelect(); fillSubSelect(null, null); document.getElementById('productModalTitle').textContent = id ? 'Editar Producto' : 'Nuevo Producto';
    if (id) {
      const p = prods.find(x => x.id === id); if (!p) return;
      document.getElementById('productId').value = p.id; document.getElementById('productName').value = p.name || ''; document.getElementById('productDesc').value = p.description || ''; document.getElementById('productPrice').value = p.price ?? ''; document.getElementById('productStock').value = p.stock ?? ''; document.getElementById('productEmoji').value = p.emoji || ''; document.getElementById('productImage').value = p.imageUrl || ''; document.getElementById('productActive').checked = !!p.active; document.getElementById('productFeatured').checked = !!p.featured; document.getElementById('productCategory').value = p.categoryId || ''; fillSubSelect(p.categoryId, p.subcategoryId); if (p.imageUrl && prev) { prev.src = p.imageUrl; prev.style.display = 'block'; }
    }
    openModal(document.getElementById('productModal'));
  }
  function closeProductModal() { closeModal(document.getElementById('productModal')); const prev = document.getElementById('productImagePreview'); if (prev) prev.style.display = 'none'; }
  async function saveProduct(ev) {
    ev.preventDefault(); const id = document.getElementById('productId').value; const price = parseFloat(document.getElementById('productPrice').value); if (isNaN(price) || price < 0) { showToast('Precio inválido', 'error'); return; }
    const stockRaw = document.getElementById('productStock').value;
    const data = { name: document.getElementById('productName').value.trim(), description: document.getElementById('productDesc').value.trim(), emoji: document.getElementById('productEmoji').value.trim() || null, price, stock: stockRaw !== '' ? parseInt(stockRaw, 10) : null, categoryId: document.getElementById('productCategory').value || null, subcategoryId: document.getElementById('productSubcategory').value || null, imageUrl: document.getElementById('productImage').value.trim() || null, active: document.getElementById('productActive').checked, featured: document.getElementById('productFeatured').checked, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    const btn = document.querySelector('#productForm button[type=submit]'); if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
    try { if (id) { await db.collection(COLL.products).doc(id).update(data); showToast('Producto actualizado ✅', 'success'); } else { data.createdAt = firebase.firestore.FieldValue.serverTimestamp(); await db.collection(COLL.products).add(data); showToast('Producto creado ✅', 'success'); } closeProductModal(); }
    catch (err) { showToast('Error: ' + err.message, 'error'); } finally { if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar Producto'; } }
  }
  async function delProduct(id) { const p = prods.find(x => x.id === id); if (!confirm(`¿Eliminar "${p?.name || 'producto'}"?`)) return; try { await db.collection(COLL.products).doc(id).delete(); showToast('Eliminado', 'info'); } catch (err) { showToast('Error: ' + err.message, 'error'); } }

  // CATEGORÍAS
  function renderCats() {
    const c = document.getElementById('categoriesManager'); if (!c) return;
    const mains = cats.filter(x => !x.parentId), subs = cats.filter(x => x.parentId);
    if (!mains.length) { c.innerHTML = `<div class="empty-state"><div class="empty-icon">📂</div><p>No hay categorías aún.</p></div>`; return; }
    let html = '';
    mains.forEach(cat => { const children = subs.filter(s => s.parentId === cat.id); html += `<div class="category-item"><span style="font-size:1.3rem">${cat.emoji || '📦'}</span><span class="category-item-name">${e(cat.name)}</span><span style="font-size:.72rem;color:var(--text-3)">${children.length} subcat.</span><button class="btn-outline btn-sm" data-ecat="${cat.id}">✏️</button><button class="btn-danger btn-sm" data-dcat="${cat.id}">🗑️</button></div>` + children.map(sub => `<div class="subcategory-item"><span style="color:var(--text-3)">└</span><span>${sub.emoji || '›'}</span><span class="item-name">${e(sub.name)}</span><button class="btn-outline btn-sm" data-ecat="${sub.id}">✏️</button><button class="btn-danger btn-sm" data-dcat="${sub.id}">🗑️</button></div>`).join(''); });
    c.innerHTML = html;
    c.querySelectorAll('[data-ecat]').forEach(btn => btn.addEventListener('click', () => openCatModal(btn.dataset.ecat)));
    c.querySelectorAll('[data-dcat]').forEach(btn => btn.addEventListener('click', () => delCat(btn.dataset.dcat)));
  }
  function bindCategoryModal() {
    document.getElementById('addCategoryBtn')?.addEventListener('click', () => openCatModal(null, false));
    document.getElementById('addSubcategoryBtn')?.addEventListener('click', () => openCatModal(null, true));
    document.getElementById('closeCategoryModal')?.addEventListener('click', closeCatModal);
    document.getElementById('cancelCategoryBtn')?.addEventListener('click', closeCatModal);
    document.getElementById('categoryModal')?.addEventListener('click', ev => { if (ev.target.id === 'categoryModal') closeCatModal(); });
    document.getElementById('categoryForm')?.addEventListener('submit', saveCat);
  }
  function openCatModal(id, forceSub = false) {
    document.getElementById('categoryForm')?.reset(); document.getElementById('categoryId').value = ''; fillParentSelect(id);
    if (id) { const cat = cats.find(c => c.id === id); if (!cat) return; document.getElementById('categoryModalTitle').textContent = cat.parentId ? 'Editar Subcategoría' : 'Editar Categoría'; document.getElementById('categoryId').value = cat.id; document.getElementById('categoryName').value = cat.name || ''; document.getElementById('categoryEmoji').value = cat.emoji || ''; setTimeout(() => { document.getElementById('categoryParent').value = cat.parentId || ''; }, 30); }
    else { document.getElementById('categoryModalTitle').textContent = forceSub ? 'Nueva Subcategoría' : 'Nueva Categoría'; if (forceSub) { const main = cats.filter(c => !c.parentId); if (main.length) setTimeout(() => { document.getElementById('categoryParent').value = main[0].id; }, 30); } }
    openModal(document.getElementById('categoryModal'));
  }
  function closeCatModal() { closeModal(document.getElementById('categoryModal')); }
  async function saveCat(ev) {
    ev.preventDefault(); const id = document.getElementById('categoryId').value;
    const data = { name: document.getElementById('categoryName').value.trim(), emoji: document.getElementById('categoryEmoji').value.trim() || null, parentId: document.getElementById('categoryParent').value || null, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    if (!data.name) { showToast('El nombre es obligatorio', 'error'); return; }
    try { if (id) { await db.collection(COLL.categories).doc(id).update(data); showToast('Categoría actualizada ✅', 'success'); } else { data.createdAt = firebase.firestore.FieldValue.serverTimestamp(); await db.collection(COLL.categories).add(data); showToast((data.parentId ? 'Subcategoría' : 'Categoría') + ' creada ✅', 'success'); } closeCatModal(); }
    catch (err) { showToast('Error: ' + err.message, 'error'); }
  }
  async function delCat(id) {
    const cat = cats.find(c => c.id === id), subs = cats.filter(c => c.parentId === id);
    if (!confirm(`¿Eliminar "${cat?.name || 'categoría'}"?${subs.length ? '\n+' + subs.length + ' subcategoría(s)' : ''}`)) return;
    const batch = db.batch(); batch.delete(db.collection(COLL.categories).doc(id)); subs.forEach(s => batch.delete(db.collection(COLL.categories).doc(s.id)));
    try { await batch.commit(); showToast('Eliminada', 'info'); } catch (err) { showToast('Error: ' + err.message, 'error'); }
  }
  function fillCatSelect() { const sel = document.getElementById('productCategory'); if (!sel) return; const cur = sel.value; sel.innerHTML = '<option value="">Sin categoría</option>' + cats.filter(c => !c.parentId).map(c => `<option value="${c.id}">${c.emoji || ''} ${e(c.name)}</option>`).join(''); if (cur) sel.value = cur; }
  function fillSubSelect(parentId, selectedId) { const sel = document.getElementById('productSubcategory'); if (!sel) return; const subs = parentId ? cats.filter(c => c.parentId === parentId) : []; sel.innerHTML = '<option value="">Sin subcategoría</option>' + subs.map(c => `<option value="${c.id}"${c.id === selectedId ? ' selected' : ''}>${c.emoji || ''} ${e(c.name)}</option>`).join(''); }
  function fillParentSelect(excludeId) { const sel = document.getElementById('categoryParent'); if (!sel) return; sel.innerHTML = '<option value="">— Categoría principal —</option>' + cats.filter(c => !c.parentId && c.id !== excludeId).map(c => `<option value="${c.id}">${c.emoji || ''} ${e(c.name)}</option>`).join(''); }

  // CAJA
  function renderCaja() {
    const container = document.getElementById('cashRegisterContainer'); if (!container) return;
    const KEY = 'kiosco_caja_' + new Date().toISOString().slice(0, 10);
    const stored = (() => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } })();
    const isOpen = stored?.status === 'open';
    container.innerHTML = `<div class="caja-card"><div class="caja-header"><h3>📅 ${new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h3><span class="caja-status ${isOpen ? 'open' : 'closed'}"><span class="caja-dot"></span>${isOpen ? 'Caja Abierta' : 'Caja Cerrada'}</span></div><div class="caja-stats"><div class="caja-stat"><span class="caja-stat-val">${APP_CONFIG.currency} ${(stored?.initialAmount || 0).toFixed(2)}</span><span class="caja-stat-label">Apertura</span></div><div class="caja-stat"><span class="caja-stat-val" id="cajaSalesVal"><span class="spinner"></span></span><span class="caja-stat-label">Ventas del día</span></div><div class="caja-stat"><span class="caja-stat-val" id="cajaTotalVal">—</span><span class="caja-stat-label">Total en caja</span></div></div>${isOpen ? `<p style="font-size:.82rem;color:var(--text-2);margin-bottom:.75rem">🕐 Abierta: ${stored?.openedAt ? new Date(stored.openedAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : ''}</p><div style="display:flex;gap:.65rem;flex-wrap:wrap;align-items:center"><input type="number" id="cajaFinalAmount" class="input-field" placeholder="Monto final (S/)" style="flex:1;min-width:160px" min="0" step="0.50"/><button class="btn-danger" id="closeCajaBtn">🔒 Cerrar caja</button></div>` : `<div style="display:flex;gap:.65rem;flex-wrap:wrap;align-items:center"><input type="number" id="cajaInitAmount" class="input-field" placeholder="Monto inicial de apertura (S/)" style="flex:1;min-width:160px" min="0" step="0.50"/><button class="btn-success" id="openCajaBtn">✅ Abrir caja</button></div>`}${stored?.closedAt ? `<div style="margin-top:.85rem;padding:.75rem;background:var(--bg-3);border-radius:var(--radius-sm);font-size:.83rem"><p>🔒 Cerrada: <strong>${new Date(stored.closedAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</strong></p><p style="margin-top:.2rem">Monto final: <strong>${APP_CONFIG.currency} ${(stored.finalAmount || 0).toFixed(2)}</strong></p></div>` : ''}<button class="btn-outline btn-sm" id="refreshCajaBtn" style="margin-top:1rem">🔄 Actualizar</button></div><div class="caja-card" style="margin-top:1rem"><h4 style="font-family:var(--font-display);font-size:.95rem;font-weight:800;margin-bottom:.85rem">📋 Pedidos del día</h4><div id="cajaDayOrders">${[1, 2, 3].map(() => `<div class="skeleton" style="height:42px;margin-bottom:.4rem"></div>`).join('')}</div></div>`;
    document.getElementById('openCajaBtn')?.addEventListener('click', () => { const amount = parseFloat(document.getElementById('cajaInitAmount')?.value) || 0; localStorage.setItem(KEY, JSON.stringify({ status: 'open', openedAt: new Date().toISOString(), initialAmount: amount })); showToast('Caja abierta ✅', 'success'); renderCaja(); });
    document.getElementById('closeCajaBtn')?.addEventListener('click', () => { const final = parseFloat(document.getElementById('cajaFinalAmount')?.value) || 0; const cur = JSON.parse(localStorage.getItem(KEY) || '{}'); localStorage.setItem(KEY, JSON.stringify({ ...cur, status: 'closed', closedAt: new Date().toISOString(), finalAmount: final })); showToast('Caja cerrada 🔒', 'info'); renderCaja(); });
    document.getElementById('refreshCajaBtn')?.addEventListener('click', renderCaja);
    loadCajaSales(stored);
  }
  async function loadCajaSales(stored) {
    try {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const snap = await db.collection(COLL.orders).where('createdAt', '>=', firebase.firestore.Timestamp.fromDate(today)).orderBy('createdAt', 'desc').get();
      const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const revenue = orders.filter(o => o.status !== 'rejected').reduce((s, o) => s + (o.total || 0), 0);
      const initial = stored?.initialAmount || 0;
      const salesEl = document.getElementById('cajaSalesVal'), totalEl = document.getElementById('cajaTotalVal');
      if (salesEl) salesEl.textContent = APP_CONFIG.currency + ' ' + revenue.toFixed(2); if (totalEl) totalEl.textContent = APP_CONFIG.currency + ' ' + (initial + revenue).toFixed(2);
      const listEl = document.getElementById('cajaDayOrders'); if (!listEl) return;
      if (!orders.length) { listEl.innerHTML = '<p style="color:var(--text-3);font-size:.85rem">Sin pedidos hoy</p>'; return; }
      const icon = { pending: '⏳', done: '✅', rejected: '❌' };
      listEl.innerHTML = orders.map(o => `<div style="display:flex;align-items:center;gap:.65rem;padding:.5rem .75rem;background:var(--bg-3);border-radius:var(--radius-sm);margin-bottom:.35rem;font-size:.82rem"><span>${icon[o.status] || '•'}</span><span style="flex:1;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e(o.customer || 'Cliente')}</span><span style="color:var(--text-2)">${(o.items || []).length} items</span><span style="font-weight:800;color:var(--accent)">${APP_CONFIG.currency} ${(o.total || 0).toFixed(2)}</span></div>`).join('');
    } catch (err) { console.error('caja sales:', err); }
  }

  // HORARIO
  async function renderSchedule() {
    const grid = document.getElementById('scheduleGrid'), saveBtn = document.getElementById('saveScheduleBtn'); if (!grid) return;
    grid.innerHTML = `<div class="skeleton" style="height:320px;border-radius:var(--radius-lg)"></div>`;
    const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    let schedule = [], eta = null;
    try { const doc = await db.collection(COLL.config).doc('settings').get(); if (doc.exists) { schedule = doc.data().schedule || []; eta = doc.data().etaMinutes || null; } } catch { }
    const def = { open: true, from: '08:00', to: '20:00' }; const sch = DAYS.map((_, i) => schedule[i] || { ...def });
    grid.innerHTML = `<div class="schedule-table">${DAYS.map((day, i) => `<div class="schedule-row"><label class="schedule-day-label"><input type="checkbox" id="sch_open${i}" ${sch[i].open ? 'checked' : ''}/><span>${day}</span></label><div class="schedule-times ${sch[i].open ? '' : 'disabled'}" id="sch_times${i}"><span style="font-size:.75rem;color:var(--text-3)">De</span><input type="time" class="input-field schedule-time" id="sch_from${i}" value="${sch[i].from}" ${!sch[i].open ? 'disabled' : ''}/><span style="font-size:.75rem;color:var(--text-3)">a</span><input type="time" class="input-field schedule-time" id="sch_to${i}" value="${sch[i].to}" ${!sch[i].open ? 'disabled' : ''}/></div></div>`).join('')}</div><div class="settings-card" style="margin-top:1rem"><h4 class="settings-card-title">⏱️ Tiempo estimado de entrega</h4><div style="display:flex;gap:.75rem;align-items:center;flex-wrap:wrap"><label style="display:flex;align-items:center;gap:.4rem;font-size:.85rem;font-weight:600;cursor:pointer"><input type="checkbox" id="etaEnabled" ${eta ? 'checked' : ''} style="width:17px;height:17px;accent-color:var(--accent)"/>Mostrar ETA a clientes</label><input type="number" id="etaMinutes" class="input-field" placeholder="Minutos" min="1" max="180" style="width:120px" value="${eta || ''}"/><button class="btn-primary btn-sm" id="saveEtaBtn">💾 Guardar ETA</button></div></div>`;
    if (saveBtn) saveBtn.style.display = '';
    DAYS.forEach((_, i) => { document.getElementById(`sch_open${i}`)?.addEventListener('change', ev => { document.getElementById(`sch_from${i}`).disabled = !ev.target.checked; document.getElementById(`sch_to${i}`).disabled = !ev.target.checked; document.getElementById(`sch_times${i}`)?.classList.toggle('disabled', !ev.target.checked); }); });
    saveBtn?.addEventListener('click', async () => { const newSch = DAYS.map((_, i) => ({ open: document.getElementById(`sch_open${i}`)?.checked || false, from: document.getElementById(`sch_from${i}`)?.value || '08:00', to: document.getElementById(`sch_to${i}`)?.value || '20:00' })); try { await db.collection(COLL.config).doc('settings').set({ schedule: newSch }, { merge: true }); showToast('Horario guardado ✅', 'success'); } catch (err) { showToast('Error: ' + err.message, 'error'); } });
    document.getElementById('saveEtaBtn')?.addEventListener('click', async () => { const enabled = document.getElementById('etaEnabled')?.checked; const mins = parseInt(document.getElementById('etaMinutes')?.value) || null; try { await db.collection(COLL.config).doc('settings').set({ etaMinutes: enabled && mins ? mins : null }, { merge: true }); showToast('ETA guardado ✅', 'success'); } catch (err) { showToast('Error: ' + err.message, 'error'); } });
  }

  // PERSONAL
  function bindStaffModal() {
    document.getElementById('addStaffBtn')?.addEventListener('click', () => openModal(document.getElementById('staffModal')));
    document.getElementById('closeStaffModal')?.addEventListener('click', () => closeModal(document.getElementById('staffModal')));
    document.getElementById('cancelStaffBtn')?.addEventListener('click', () => closeModal(document.getElementById('staffModal')));
    document.getElementById('staffModal')?.addEventListener('click', ev => { if (ev.target.id === 'staffModal') closeModal(ev.target); });
    document.getElementById('saveStaffBtn')?.addEventListener('click', saveStaff);
  }
  async function renderStaff() {
    const container = document.getElementById('staffList'); if (!container) return;
    container.innerHTML = `<div class="skeleton" style="height:120px;border-radius:var(--radius-lg)"></div>`;
    let members = []; try { const doc = await db.collection(COLL.config).doc('staff').get(); members = doc.exists ? (doc.data().members || []) : []; } catch { }
    staffCache = members;
    if (!members.length) { container.innerHTML = `<div class="empty-state"><div class="empty-icon">👤</div><p>Sin personal registrado. Usa "+ Agregar empleado".</p></div>`; return; }
    container.innerHTML = `<div class="staff-list">${members.map((m, i) => `<div class="staff-item"><div class="staff-avatar">${(m.name || '?')[0].toUpperCase()}</div><div class="staff-info"><p class="staff-name">${e(m.name || 'Sin nombre')}</p><p class="staff-phone">${e(m.phone)}</p></div><span class="role-badge ${m.role === 'admin' ? 'admin' : 'employee'}">${m.role === 'admin' ? '👑 Admin' : '🧑‍💼 Empleado'}</span><button class="btn-danger btn-sm" data-rm="${i}">🗑️</button></div>`).join('')}</div>`;
    container.querySelectorAll('[data-rm]').forEach(btn => btn.addEventListener('click', async () => { if (!confirm('¿Eliminar a este miembro?')) return; members.splice(parseInt(btn.dataset.rm), 1); try { await db.collection(COLL.config).doc('staff').set({ members }, { merge: true }); showToast('Eliminado', 'info'); renderStaff(); } catch (err) { showToast('Error: ' + err.message, 'error'); } }));
  }
  async function saveStaff() {
    const phone = document.getElementById('staffPhone')?.value.trim(); const name = document.getElementById('staffName')?.value.trim(); const role = document.getElementById('staffRole')?.value || 'employee';
    if (!phone) { showToast('El teléfono es obligatorio', 'error'); return; }
    const full = '+51' + phone.replace(/\D/g, ''); const members = staffCache || [];
    if (members.find(m => m.phone === full)) { showToast('Este número ya existe', 'error'); return; }
    members.push({ name: name || 'Sin nombre', phone: full, role });
    try { await db.collection(COLL.config).doc('staff').set({ members }, { merge: true }); closeModal(document.getElementById('staffModal')); document.getElementById('staffPhone').value = ''; document.getElementById('staffName').value = ''; showToast('Empleado agregado ✅', 'success'); renderStaff(); }
    catch (err) { showToast('Error: ' + err.message, 'error'); }
  }

  // APARIENCIA
  async function loadBranding() {
    try { const doc = await db.collection(COLL.config).doc('theme').get(); if (!doc.exists) return; const d = doc.data(); if (d.accentColor) applyColor(d.accentColor); if (d.storeName) { const lt = document.querySelector('.logo-text'); if (lt) lt.textContent = d.storeName; APP_CONFIG.storeName = d.storeName; document.title = d.storeName; } if (d.storeEmoji) { const li = document.querySelector('.logo-icon'); if (li) li.textContent = d.storeEmoji; } } catch { }
  }
  async function renderBranding() {
    try {
      const doc = await db.collection(COLL.config).doc('theme').get();
      const sets = await db.collection(COLL.config).doc('settings').get();
      const d = doc.exists ? doc.data() : {}; const s = sets.exists ? sets.data() : {};
      const fields = { brandStoreName: 'storeName', brandLogoEmoji: 'storeEmoji', brandColor: 'accentColor', brandYapeNumber: 'yapeNumber', brandPlinNumber: 'plinNumber' };
      Object.entries(fields).forEach(([id, key]) => { const el = document.getElementById(id); if (el && d[key]) el.value = d[key]; });
      const etaEl = document.getElementById('brandDeliveryTime'); if (etaEl && s.etaMinutes) etaEl.value = s.etaMinutes;
      const prev = document.getElementById('colorPreview'); if (prev && d.accentColor) prev.style.background = d.accentColor;
      document.querySelectorAll('.color-swatch').forEach(sw => { sw.classList.toggle('active', sw.dataset.color === d.accentColor); sw.classList.toggle('selected', sw.dataset.color === d.accentColor); });
    } catch { }
    document.querySelectorAll('.color-swatch').forEach(sw => { sw.onclick = () => { document.querySelectorAll('.color-swatch').forEach(s => { s.classList.remove('active', 'selected'); }); sw.classList.add('active', 'selected'); const c = sw.dataset.color; applyColor(c); const ci = document.getElementById('brandColor'), prev = document.getElementById('colorPreview'); if (ci) ci.value = c; if (prev) prev.style.background = c; }; });
    document.getElementById('brandColor')?.addEventListener('input', ev => { applyColor(ev.target.value); const prev = document.getElementById('colorPreview'); if (prev) prev.style.background = ev.target.value; });
    document.getElementById('saveBrandingBtn')?.addEventListener('click', saveBranding);
  }
  async function saveBranding() {
    const name = document.getElementById('brandStoreName')?.value.trim(); const emoji = document.getElementById('brandLogoEmoji')?.value.trim(); const color = document.getElementById('brandColor')?.value; const eta = parseInt(document.getElementById('brandDeliveryTime')?.value) || null; const yape = document.getElementById('brandYapeNumber')?.value.trim(); const plin = document.getElementById('brandPlinNumber')?.value.trim();
    const theme = {}; if (name) theme.storeName = name; if (emoji) theme.storeEmoji = emoji; if (color) theme.accentColor = color; if (yape) theme.yapeNumber = yape; if (plin) theme.plinNumber = plin;
    try { await db.collection(COLL.config).doc('theme').set(theme, { merge: true }); if (eta) await db.collection(COLL.config).doc('settings').set({ etaMinutes: eta }, { merge: true }); if (name) { const lt = document.querySelector('.logo-text'); if (lt) lt.textContent = name; APP_CONFIG.storeName = name; document.title = name; } if (emoji) { const li = document.querySelector('.logo-icon'); if (li) li.textContent = emoji; } if (color) applyColor(color); showToast('Apariencia guardada ✅', 'success'); }
    catch (err) { showToast('Error: ' + err.message, 'error'); }
  }
  function applyColor(color) { document.documentElement.style.setProperty('--accent', color); const r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16); document.documentElement.style.setProperty('--accent-glow', `rgba(${r},${g},${b},.22)`); }
  return { init };
})();