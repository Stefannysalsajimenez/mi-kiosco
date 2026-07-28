// js/share.js — WhatsApp text + printable PDF receipt
const Share = (() => {

  function openWhatsapp(items, total) {
    if (!items.length) { showToast('El carrito está vacío', 'error'); return; }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay open';
    overlay.innerHTML = `
      <div class="modal-box" style="max-width:360px">
        <h2 class="modal-title">Compartir pedido 💬</h2>
        <p style="color:var(--text-2);font-size:.88rem;margin-bottom:1.5rem">¿Cómo quieres compartirlo?</p>
        <div style="display:flex;flex-direction:column;gap:.75rem">
          <button class="btn-primary btn-block" id="_shareText">💬 Compartir como texto</button>
          <button class="btn-outline btn-block" id="_sharePdf">📄 Generar recibo PDF</button>
          <button class="btn-outline btn-block" id="_shareCancel" style="margin-top:.2rem">Cancelar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const close = () => { overlay.style.animation='fadeOut .2s ease forwards'; setTimeout(()=>overlay.remove(),220); };
    overlay.querySelector('#_shareCancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if(e.target===overlay) close(); });

    overlay.querySelector('#_shareText').addEventListener('click', () => {
      close();
      const txt = buildText(items, total);
      window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank');
    });

    overlay.querySelector('#_sharePdf').addEventListener('click', () => {
      close();
      openReceipt(items, total);
    });
  }

  function buildText(items, total) {
    const date  = new Date().toLocaleString('es-PE',{weekday:'long',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'});
    const lines = items.map(({product:p,qty}) =>
      `  • ${p.name} ×${qty} = ${APP_CONFIG.currency} ${(p.price*qty).toFixed(2)}`
    ).join('\n');
    return `🛍️ *Pedido en ${APP_CONFIG.storeName}*\n📅 ${date}\n─────────────────\n${lines}\n─────────────────\n💰 *Total: ${APP_CONFIG.currency} ${total.toFixed(2)}*\n\n_Generado desde ${APP_CONFIG.storeName}_`;
  }

  function openReceipt(items, total) {
    const date  = new Date().toLocaleString('es-PE',{weekday:'long',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'});
    const store = APP_CONFIG.storeName;
    const rows  = items.map(({product:p,qty}) =>
      `<tr>
         <td>${p.name}</td>
         <td style="text-align:center">${qty}</td>
         <td style="text-align:right">${APP_CONFIG.currency} ${p.price.toFixed(2)}</td>
         <td style="text-align:right">${APP_CONFIG.currency} ${(p.price*qty).toFixed(2)}</td>
       </tr>`
    ).join('');

    const html = `<!DOCTYPE html><html lang="es">
<head><meta charset="UTF-8"/><title>Recibo ${store}</title>
<style>
  body{font-family:Arial,sans-serif;max-width:580px;margin:40px auto;padding:20px;color:#222}
  .logo{color:#f97316;font-size:1.6rem;font-weight:900;margin-bottom:4px}
  .date{color:#888;font-size:.84rem;margin-bottom:22px}
  table{width:100%;border-collapse:collapse;margin-bottom:16px}
  th{background:#f97316;color:#fff;padding:8px 10px;text-align:left;font-size:.82rem}
  td{padding:7px 10px;border-bottom:1px solid #eee;font-size:.88rem}
  .total-row td{font-weight:700;border-top:2.5px solid #f97316;font-size:1rem}
  .footer{color:#bbb;font-size:.76rem;margin-top:24px;text-align:center}
  @media print{.no-print{display:none}}
</style></head>
<body>
  <p class="logo">🛍️ ${store}</p>
  <p class="date">📅 ${date}</p>
  <table>
    <thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr></thead>
    <tbody>
      ${rows}
      <tr class="total-row">
        <td colspan="3">Total</td>
        <td style="text-align:right">${APP_CONFIG.currency} ${total.toFixed(2)}</td>
      </tr>
    </tbody>
  </table>
  <div class="no-print" style="text-align:center;margin-top:20px;display:flex;gap:10px;justify-content:center">
    <button onclick="window.print()" style="background:#f97316;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-weight:700;cursor:pointer;font-size:.9rem">🖨️ Imprimir / Guardar PDF</button>
    <button onclick="shareWa()" style="background:#25D366;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-weight:700;cursor:pointer;font-size:.9rem">💬 Compartir por WhatsApp</button>
  </div>
  <p class="footer">Generado desde ${store}</p>
  <script>
    function shareWa(){
      const text = encodeURIComponent(document.title + ' — ${APP_CONFIG.currency} ${total.toFixed(2)}');
      window.open('https://wa.me/?text=' + text, '_blank');
    }
  <\/script>
</body></html>`;

    const blob = new Blob([html], {type:'text/html;charset=utf-8'});
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url, '_blank');
    if (!win) {
      const a = Object.assign(document.createElement('a'),
        {href:url, download:`recibo-${Date.now()}.html`});
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 15000);
    showToast('Recibo generado 📄', 'success');
  }

  return { openWhatsapp, buildText };
})();
