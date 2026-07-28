// js/branding.js — Apariencia en tiempo real
const Branding = (() => {
    const COLORS = [
        '#f97316', '#ef4444', '#a855f7', '#06b6d4',
        '#22c55e', '#ec4899', '#eab308', '#3b82f6', '#6366f1', '#14b8a6',
    ];
    let unsubTheme = null;
    let currentTheme = {};
    let styleTag = null;

    function applyColor(color) {
        if (!color) return;
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = 'brandingColorOverride';
            document.head.appendChild(styleTag);
        }
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        styleTag.textContent = `:root,.theme-dark,.theme-light{--accent:${color}!important;--accent-glow:rgba(${r},${g},${b},.22)!important;}`;
        document.documentElement.style.setProperty('--accent', color);
        document.documentElement.style.setProperty('--accent-glow', `rgba(${r},${g},${b},.22)`);
    }

    function applyTheme(theme) {
        if (theme.accentColor) applyColor(theme.accentColor);
        if (theme.storeName) {
            const lt = document.querySelector('.logo-text');
            if (lt) lt.textContent = theme.storeName;
            if (window.APP_CONFIG) APP_CONFIG.storeName = theme.storeName;
            document.title = theme.storeName;
        }
        const li = document.querySelector('.logo-icon');
        if (li) {
            if (theme.storeLogoUrl) {
                li.innerHTML = `<img src="${esc(theme.storeLogoUrl)}" alt="logo" style="width:28px;height:28px;border-radius:6px;object-fit:cover;display:block" onerror="this.parentElement.textContent='${esc(theme.storeEmoji || '🛍️')}'"/>`;
            } else {
                li.textContent = theme.storeEmoji || '🛍️';
            }
        }
    }

    function load() {
        if (unsubTheme) unsubTheme();
        unsubTheme = db.collection(COLL.config).doc('theme').onSnapshot(
            doc => {
                if (!doc.exists) return;
                currentTheme = doc.data();
                applyTheme(currentTheme);
                if (document.getElementById('aparienciaLiveContainer')?.children.length) renderForm();
            },
            err => console.warn('Branding error:', err.code)
        );
    }

    async function save(changes) {
        const before = { ...currentTheme };
        try {
            await db.collection(COLL.config).doc('theme').set(changes, { merge: true });
            Object.assign(currentTheme, changes);
            applyTheme(currentTheme);
            try {
                const adminPhone = window.auth?.currentUser?.phoneNumber || 'admin';
                const changed = Object.keys(changes).filter(k => before[k] !== changes[k]);
                if (changed.length) {
                    await db.collection('audit_log').add({
                        action: 'Apariencia actualizada', admin: adminPhone, changedFields: changed,
                        before: changed.reduce((o, k) => { o[k] = before[k] ?? null; return o; }, {}),
                        after: changed.reduce((o, k) => { o[k] = changes[k] ?? null; return o; }, {}),
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
            } catch { }
            showToast('Apariencia guardada ✅', 'success');
            return true;
        } catch (e) { showToast('Error: ' + e.message, 'error'); return false; }
    }

    function renderForm() {
        const container = document.getElementById('aparienciaLiveContainer');
        if (!container) return;
        const t = currentTheme;
        const cur = t.accentColor || '#f97316';

        container.innerHTML = `
      <div class="settings-card">
        <h3 class="settings-card-title">🏪 Identidad</h3>
        <div class="appearance-section">
          <label class="appearance-label">Nombre de la tienda</label>
          <div class="appearance-row">
            <input type="text" id="bName" class="input-field" value="${esc(t.storeName || '')}" placeholder="Mi Kiosco"/>
            <button class="btn-primary btn-sm" id="bSaveName">Guardar</button>
          </div>
        </div>
        <div class="appearance-section">
          <label class="appearance-label">Logo</label>
          <div style="display:flex;gap:1rem;flex-wrap:wrap;align-items:flex-start">
            <div id="bLogoPreview" style="width:64px;height:64px;border-radius:10px;background:var(--bg-3);display:flex;align-items:center;justify-content:center;font-size:1.8rem;overflow:hidden;flex-shrink:0;border:2px solid var(--border)">
              ${t.storeLogoUrl ? `<img src="${esc(t.storeLogoUrl)}" style="width:100%;height:100%;object-fit:cover"/>` : (t.storeEmoji || '🛍️')}
            </div>
            <div style="flex:1;min-width:180px;display:flex;flex-direction:column;gap:.4rem">
              <input type="url" id="bLogoUrl" class="input-field" value="${esc(t.storeLogoUrl || '')}" placeholder="URL de imagen"/>
              <div style="display:flex;gap:.4rem;align-items:center">
                <span style="font-size:.78rem;color:var(--text-3)">o emoji:</span>
                <input type="text" id="bEmoji" class="input-field" value="${esc(t.storeEmoji || '')}" placeholder="🛍️" maxlength="4" style="max-width:75px"/>
              </div>
              <div style="display:flex;gap:.4rem;flex-wrap:wrap">
                <button class="btn-primary btn-sm" id="bApplyLogo">Aplicar</button>
                ${t.storeLogoUrl ? `<button class="btn-danger btn-sm" id="bRemoveLogo">Quitar</button>` : ''}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="settings-card" style="margin-top:1rem">
        <h3 class="settings-card-title">🎨 Color principal</h3>
        <div style="display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:.85rem">
          ${COLORS.map(c => `<button style="width:36px;height:36px;border-radius:50%;background:${c};border:3px solid ${cur === c ? 'var(--text)' : 'transparent'};cursor:pointer;flex-shrink:0" data-c="${c}" title="${c}"></button>`).join('')}
          <input type="color" id="bCustomColor" value="${cur}" style="width:36px;height:36px;border-radius:50%;border:3px solid var(--border);cursor:pointer;padding:1px;background:none"/>
        </div>
        <div id="bColorPreview" style="background:${cur};color:#fff;padding:.65rem;border-radius:var(--radius-md);text-align:center;font-weight:700;font-size:.88rem">Vista previa</div>
      </div>

      <div class="settings-card" style="margin-top:1rem">
        <div style="display:flex;justify-content:space-between;margin-bottom:.65rem">
          <h3 class="settings-card-title" style="margin:0">📜 Auditoría</h3>
          <button class="btn-outline btn-sm" id="bRefreshAudit">🔄</button>
        </div>
        <div id="auditList"><div class="skeleton" style="height:60px;border-radius:8px"></div></div>
      </div>`;

        document.getElementById('bSaveName')?.addEventListener('click', async () => {
            const name = document.getElementById('bName')?.value.trim();
            if (name) { await save({ storeName: name }); renderForm(); }
        });

        document.getElementById('bLogoUrl')?.addEventListener('input', e => {
            const p = document.getElementById('bLogoPreview');
            if (p && e.target.value) p.innerHTML = `<img src="${esc(e.target.value)}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.textContent='❌'"/>`;
        });
        document.getElementById('bApplyLogo')?.addEventListener('click', async () => {
            const url = document.getElementById('bLogoUrl')?.value.trim();
            const emoji = document.getElementById('bEmoji')?.value.trim();
            await save({ storeLogoUrl: url || null, storeEmoji: emoji || null }); renderForm();
        });
        document.getElementById('bRemoveLogo')?.addEventListener('click', async () => { await save({ storeLogoUrl: null }); renderForm(); });

        container.querySelectorAll('[data-c]').forEach(sw => {
            sw.addEventListener('click', async () => {
                applyColor(sw.dataset.c);
                document.getElementById('bColorPreview').style.background = sw.dataset.c;
                document.getElementById('bCustomColor').value = sw.dataset.c;
                await save({ accentColor: sw.dataset.c }); renderForm();
            });
        });
        document.getElementById('bCustomColor')?.addEventListener('input', e => {
            applyColor(e.target.value);
            document.getElementById('bColorPreview').style.background = e.target.value;
        });
        document.getElementById('bCustomColor')?.addEventListener('change', async e => { await save({ accentColor: e.target.value }); });
        document.getElementById('bRefreshAudit')?.addEventListener('click', loadAudit);
        loadAudit();
    }

    async function loadAudit() {
        const list = document.getElementById('auditList');
        if (!list) return;
        try {
            const snap = await db.collection('audit_log').orderBy('createdAt', 'desc').limit(15).get();
            const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (!logs.length) { list.innerHTML = `<p style="color:var(--text-3);font-size:.83rem">Sin cambios aún</p>`; return; }
            list.innerHTML = logs.map(l => {
                const date = l.createdAt?.toDate ? l.createdAt.toDate().toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
                const fields = (l.changedFields || []).join(', ');
                return `<div style="padding:.55rem .75rem;background:var(--bg-3);border-radius:6px;margin-bottom:.35rem;font-size:.79rem;border-left:2px solid var(--accent)">
          <div style="display:flex;justify-content:space-between"><strong>${esc(l.action || 'Cambio')}</strong><span style="color:var(--text-3)">${date}</span></div>
          <p style="color:var(--text-2);margin:.15rem 0">${fields}</p>
          <p style="color:var(--text-3);font-size:.72rem">Por: ${esc(l.admin || 'admin')}</p>
        </div>`;
            }).join('');
        } catch (e) {
            list.innerHTML = `<p style="color:var(--danger);font-size:.8rem">Error: ${e.message}</p>`;
        }
    }

    function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

    return { load, applyColor, applyTheme, renderForm, save };
})();
