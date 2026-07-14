// js/store.js — Public store with real-time Firestore (no composite indexes)
const Store = (() => {
  let cats = [], prods = [], activeCat = null, activeSub = null, q = '';
  let unsubC = null, unsubP = null;

  function init() {
    subCats();
    subProds();
    document.getElementById('searchInput')?.addEventListener('input', e => {
      q = e.target.value.trim();
      renderProds();
    });
  }

  function subCats() {
    if (unsubC) unsubC();
    // No orderBy — sort in JS to avoid composite index
    unsubC = db.collection(COLL.categories).onSnapshot(snap => {
      cats = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'));
      renderCats();
    }, err => console.warn('cats:', err.code));
  }

  function subProds() {
    if (unsubP) unsubP();
    // Single where — no composite index needed
    unsubP = db.collection(COLL.products).where('active', '==', true).onSnapshot(snap => {
      prods = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'));
      renderProds();
    }, err => {
      console.warn('prods:', err.code, err.message);
      const g = document.getElementById('productsGrid');
      if (g) g.innerHTML = `<div class="col-12 text-center py-5"><p class="text-danger"><i class="bi bi-exclamation-triangle me-2"></i>Error al cargar productos: ${err.code}</p></div>`;
    });
  }

  function renderCats() {
    const el = document.getElementById('categoryList');
    if (!el) return;
    const mains = cats.filter(c => !c.parentId);
    const subs = cats.filter(c => c.parentId);
    let h = `<li class="nav-item">
      <a class="nav-link cat-link ${!activeCat ? 'active' : ''}" data-cat="" href="#">
        <i class="bi bi-grid-fill me-2"></i>Todos
      </a></li>`;
    mains.forEach(m => {
      const ch = subs.filter(s => s.parentId === m.id);
      h += `<li class="nav-item">
        <a class="nav-link cat-link ${activeCat === m.id && !activeSub ? 'active' : ''}" data-cat="${m.id}" href="#">
          <i class="bi bi-tag me-2"></i>${esc(m.name)}
        </a>`;
      if (ch.length) {
        h += `<ul class="nav flex-column ms-3">`;
        ch.forEach(s => {
          h += `<li class="nav-item"><a class="nav-link cat-link subcat-link ${activeSub === s.id ? 'active' : ''}" data-cat="${m.id}" data-sub="${s.id}" href="#">
            <i class="bi bi-arrow-return-right me-1"></i>${esc(s.name)}
          </a></li>`;
        });
        h += `</ul>`;
      }
      h += `</li>`;
    });
    el.innerHTML = h;
    el.querySelectorAll('.cat-link').forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      activeCat = a.dataset.cat || null;
      activeSub = a.dataset.sub || null;
      const entity = activeSub ? cats.find(c => c.id === activeSub) : cats.find(c => c.id === activeCat);
      const title = document.getElementById('currentCatTitle');
      if (title) title.textContent = entity ? entity.name : 'Todos los productos';
      renderCats(); renderProds();
    }));
  }

  function renderProds() {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;
    document.getElementById('productsLoading')?.remove();

    let list = [...prods];
    if (activeSub) {
      list = list.filter(p => p.subcategoryId === activeSub);
    } else if (activeCat) {
      const childIds = cats.filter(c => c.parentId === activeCat).map(c => c.id);
      list = list.filter(p => p.categoryId === activeCat || childIds.includes(p.subcategoryId));
    }
    if (q) {
      const lq = q.toLowerCase();
      list = list.filter(p => (p.name || '').toLowerCase().includes(lq) || (p.description || '').toLowerCase().includes(lq));
    }

    if (!list.length) {
      grid.innerHTML = `<div class="col-12 text-center py-5"><i class="bi bi-search display-4 text-muted"></i><p class="mt-3 text-muted">${prods.length ? 'Sin resultados' : 'No hay productos disponibles'}</p></div>`;
      return;
    }

    grid.innerHTML = list.map(buildCard).join('');
    grid.querySelectorAll('.btn-add').forEach(btn => btn.addEventListener('click', () => {
      const p = prods.find(x => x.id === btn.dataset.id);
      if (p && window.Cart) Cart.add(p);
    }));
    grid.querySelectorAll('.btn-inc').forEach(btn => btn.addEventListener('click', () => {
      const p = prods.find(x => x.id === btn.dataset.id);
      if (p && window.Cart) Cart.add(p);
    }));
    grid.querySelectorAll('.btn-dec').forEach(btn => btn.addEventListener('click', () => {
      if (window.Cart) Cart.remove(btn.dataset.id);
    }));
  }

  function buildCard(p) {
    const qty = window.Cart ? Cart.qty(p.id) : 0;
    const imgUrl = normalizeUrl(p.imageUrl);
    const fallback = `<div class="prod-img-placeholder d-flex align-items-center justify-content-center h-100"><i class="bi bi-bag display-4 text-muted"></i></div>`;
    const imgHtml = imgUrl
      ? `<img src="${imgUrl}" alt="${attr(p.name)}" class="card-img-top prod-img" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">${imgUrl ? `<div class="prod-img-placeholder d-flex align-items-center justify-content-center h-100" style="display:none!important"><i class="bi bi-bag display-4 text-muted"></i></div>` : ''}`
      : fallback;
    const stockBadge = (p.stock != null && p.stock <= 5 && p.stock > 0)
      ? `<span class="badge bg-danger position-absolute top-0 end-0 m-2">Últimos ${p.stock}</span>` : '';
    const ctrl = qty > 0
      ? `<div class="input-group input-group-sm qty-ctrl">
          <button class="btn btn-outline-secondary btn-dec" data-id="${p.id}"><i class="bi bi-dash"></i></button>
          <span class="input-group-text qty-val">${qty}</span>
          <button class="btn btn-outline-secondary btn-inc" data-id="${p.id}"><i class="bi bi-plus"></i></button>
        </div>`
      : `<button class="btn btn-primary btn-sm w-100 btn-add" data-id="${p.id}"><i class="bi bi-cart-plus me-1"></i>Agregar</button>`;
    return `<div class="col">
      <div class="card h-100 prod-card">
        <div class="prod-img-wrap position-relative">${imgHtml}${stockBadge}</div>
        <div class="card-body d-flex flex-column p-3">
          <h6 class="card-title prod-name mb-1">${esc(p.name)}</h6>
          ${p.description ? `<p class="card-text prod-desc text-muted small mb-2">${esc(p.description)}</p>` : ''}
          <div class="mt-auto">
            <div class="d-flex align-items-center justify-content-between mb-2">
              <span class="prod-price fw-bold">${APP_CONFIG.currency} ${Number(p.price).toFixed(2)}</span>
              ${p.stock != null ? `<small class="text-muted">Stock: ${p.stock}</small>` : ''}
            </div>
            ${ctrl}
          </div>
        </div>
      </div>
    </div>`;
  }

  function normalizeUrl(url) {
    if (!url) return null;
    const s = String(url).trim();
    if (!s) return null;
    if (/^(https?:\/\/|data:image)/i.test(s)) return s;
    if (s.startsWith('//')) return 'https:' + s;
    return s;
  }

  function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function attr(s) { return String(s ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

  function refreshCards() { renderProds(); }

  return { init, refreshCards };
})();
