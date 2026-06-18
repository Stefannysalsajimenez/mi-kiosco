function capitalize(s){return String(s).charAt(0).toUpperCase()+String(s).slice(1);}
function openModal(el){if(!el)return;el.style.display='flex';requestAnimationFrame(()=>el.classList.add('open'));}
function closeModal(el){if(!el)return;el.classList.remove('open');setTimeout(()=>{if(!el.classList.contains('open'))el.style.display='';},260);}
function showToast(msg,type='info'){
  const c=document.getElementById('toastContainer');if(!c)return;
  const icons={success:'✅',error:'❌',info:'ℹ️',warning:'⚠️'};
  const t=document.createElement('div');t.className='toast '+type;
  t.innerHTML='<span>'+(icons[type]||'ℹ️')+'</span><span>'+msg+'</span>';
  c.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';t.style.transition='opacity .3s';setTimeout(()=>t.remove(),320);},3000);
}
const App=(()=>{
  let page='store';
  function showPage(p){
    page=p;
    document.querySelectorAll('.page').forEach(el=>el.classList.remove('active'));
    const target=document.getElementById(p==='store'?'pageStore':'pageAdmin');
    if(target)target.classList.add('active');
    const pb=document.getElementById('profileBtn'),ab=document.getElementById('loginBtn');
    if(p==='admin'){
      if(pb)pb.style.display='none';
      if(ab){ab.style.display='flex';ab.innerHTML='🏪';ab.title='Ver tienda';}
      if(window.Admin)Admin.init();
      if(window.Dashboard)Dashboard.init();
      if(window.Orders)Orders.init();
      if(window.Notifications){Notifications.init();Notifications.requestPermission?.();}
    }else{
      if(ab)ab.style.display='none';
      if(pb){pb.style.display='flex';updateProfileBtn();}
      if(window.Notifications)Notifications.stop?.();
    }
  }
  function updateProfileBtn(){
    const btn=document.getElementById('profileBtn');if(!btn)return;
    const name=localStorage.getItem('kiosco_user_name');
    if(name){btn.innerHTML='<span style="font-size:.6rem;font-weight:700;max-width:48px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1">'+name.split(' ')[0]+'</span>';btn.title=name+' · Ver perfil';}
    else{btn.innerHTML='👤';btn.title='Ingresar';}
  }
  function initTheme(){
    const saved=localStorage.getItem('kiosco_theme')||'dark';applyTheme(saved);
    document.getElementById('themeToggle')?.addEventListener('click',()=>applyTheme(document.body.classList.contains('theme-dark')?'light':'dark'));
  }
  function applyTheme(t){document.body.classList.remove('theme-dark','theme-light');document.body.classList.add('theme-'+t);localStorage.setItem('kiosco_theme',t);const i=document.querySelector('.theme-icon');if(i)i.textContent=t==='dark'?'☀️':'🌙';}
  async function loadBranding(){
    try{
      const doc=await db.collection(COLL.config).doc('theme').get();if(!doc.exists)return;const d=doc.data();
      if(d.accentColor){document.documentElement.style.setProperty('--accent',d.accentColor);const r=parseInt(d.accentColor.slice(1,3),16),g=parseInt(d.accentColor.slice(3,5),16),b=parseInt(d.accentColor.slice(5,7),16);document.documentElement.style.setProperty('--accent-glow',`rgba(${r},${g},${b},.22)`);}
      if(d.storeName){const el=document.querySelector('.logo-text');if(el)el.textContent=d.storeName;APP_CONFIG.storeName=d.storeName;document.title=d.storeName;}
      if(d.storeEmoji){const el=document.querySelector('.logo-icon');if(el)el.textContent=d.storeEmoji;}
    }catch{}
  }
  function bindLoginModal(){
    const modal=document.getElementById('loginModal');if(!modal)return;
    const errEl=document.getElementById('loginError');
    function switchTab(t){
      document.getElementById('loginTabUser')?.classList.toggle('active',t==='user');
      document.getElementById('loginTabAdmin')?.classList.toggle('active',t==='admin');
      const pu=document.getElementById('loginPanelUser'),pa=document.getElementById('loginPanelAdmin');
      if(pu)pu.style.display=t==='user'?'':'none';if(pa)pa.style.display=t==='admin'?'':'none';
      if(errEl)errEl.textContent='';
    }
    document.getElementById('loginTabUser')?.addEventListener('click',()=>switchTab('user'));
    document.getElementById('loginTabAdmin')?.addEventListener('click',()=>switchTab('admin'));
    document.getElementById('closeLoginModal')?.addEventListener('click',()=>closeModal(modal));
    modal.addEventListener('click',ev=>{if(ev.target===modal)closeModal(modal);});
    document.getElementById('userLoginBtn')?.addEventListener('click',()=>{
      const name=document.getElementById('userNameInput')?.value.trim();
      const phone=document.getElementById('userPhoneInput')?.value.trim();
      if(!name){if(errEl)errEl.textContent='Ingresa tu nombre';return;}
      localStorage.setItem('kiosco_user_name',name);
      if(phone)localStorage.setItem('kiosco_user_phone','+51'+phone.replace(/\D/g,''));
      closeModal(modal);updateProfileBtn();showToast('¡Bienvenido, '+name+'! 👋','success');
    });
    document.getElementById('sendCodeBtn')?.addEventListener('click',async()=>{
      const digits=document.getElementById('phoneInput')?.value.trim();
      const btn=document.getElementById('sendCodeBtn');
      if(!digits||digits.replace(/\D/g,'').length<9){if(errEl)errEl.textContent='Número inválido';return;}
      if(errEl)errEl.textContent='';if(btn){btn.disabled=true;btn.textContent='Enviando…';}
      try{
        await Auth.sendCode(digits);
        document.getElementById('loginStep1').style.display='none';document.getElementById('loginStep2').style.display='';
        showToast('Código enviado 📱','success');setTimeout(()=>document.getElementById('codeInput')?.focus(),100);
      }catch(err){if(errEl)errEl.textContent=err.message||'Error al enviar';}
      finally{if(btn){btn.disabled=false;btn.textContent='Enviar código 📱';}}
    });
    document.getElementById('verifyCodeBtn')?.addEventListener('click',async()=>{
      const code=document.getElementById('codeInput')?.value.trim();
      const btn=document.getElementById('verifyCodeBtn');
      if(!code||code.length!==6){if(errEl)errEl.textContent='El código tiene 6 dígitos';return;}
      if(btn){btn.disabled=true;btn.textContent='Verificando…';}
      try{
        const user=await Auth.verifyCode(code);const isAdm=await Auth.checkIsAdmin(user);
        if(isAdm){closeModal(modal);showPage('admin');showToast('Bienvenido, administrador 👋','success');}
        else{await Auth.signOut();if(errEl)errEl.textContent='Acceso denegado.';}
      }catch{if(errEl)errEl.textContent='Código incorrecto o expirado';}
      finally{if(btn){btn.disabled=false;btn.textContent='Verificar ✅';}}
    });
    Auth.onAuthChange(async user=>{if(user){const isAdm=await Auth.checkIsAdmin(user);if(!isAdm)await Auth.signOut();}});
  }
  function bindProfileModal(){
    const pb=document.getElementById('profileBtn'),modal=document.getElementById('profileModal');
    if(!pb)return;
    pb.addEventListener('click',()=>{
      const name=localStorage.getItem('kiosco_user_name');
      if(name){
        const ni=document.getElementById('profileNameInput'),pi=document.getElementById('profilePhoneInput');
        const ph=localStorage.getItem('kiosco_user_phone')||'';
        if(ni)ni.value=name;if(pi)pi.value=ph.replace('+51','');
        modal?.querySelectorAll('[data-profile-tab]').forEach(t=>t.classList.remove('active'));
        modal?.querySelector('[data-profile-tab="info"]')?.classList.add('active');
        const ti=document.getElementById('profileTabInfo'),th=document.getElementById('profileTabHistory');
        if(ti)ti.style.display='';if(th)th.style.display='none';
        openModal(modal);
      }else{openModal(document.getElementById('loginModal'));}
    });
    if(!modal)return;
    document.getElementById('closeProfileModal')?.addEventListener('click',()=>closeModal(modal));
    modal.addEventListener('click',ev=>{if(ev.target===modal)closeModal(modal);});
    modal.querySelectorAll('[data-profile-tab]').forEach(tab=>{
      tab.addEventListener('click',()=>{
        modal.querySelectorAll('[data-profile-tab]').forEach(t=>t.classList.remove('active'));tab.classList.add('active');
        const t=tab.dataset.profileTab;
        const ti=document.getElementById('profileTabInfo'),th=document.getElementById('profileTabHistory');
        if(ti)ti.style.display=t==='info'?'':'none';if(th)th.style.display=t==='history'?'':'none';
        if(t==='history')loadOrderHistory();
      });
    });
    document.getElementById('saveProfileBtn')?.addEventListener('click',()=>{
      const name=document.getElementById('profileNameInput')?.value.trim();
      const phone=document.getElementById('profilePhoneInput')?.value.trim();
      if(!name){showToast('Ingresa tu nombre','error');return;}
      localStorage.setItem('kiosco_user_name',name);
      if(phone)localStorage.setItem('kiosco_user_phone','+51'+phone.replace(/\D/g,''));
      updateProfileBtn();closeModal(modal);showToast('Perfil guardado ✅','success');
    });
    document.getElementById('logoutUserBtn')?.addEventListener('click',()=>{
      if(!confirm('¿Cerrar sesión?'))return;
      localStorage.removeItem('kiosco_user_name');localStorage.removeItem('kiosco_user_phone');
      closeModal(modal);updateProfileBtn();showToast('Sesión cerrada','info');
    });
  }
  async function loadOrderHistory(){
    const container=document.getElementById('profileOrderHistory');if(!container)return;
    const name=localStorage.getItem('kiosco_user_name');
    if(!name){container.innerHTML='<div class="empty-state"><div class="empty-icon">👤</div><p>Guarda tu nombre para ver tu historial</p></div>';return;}
    container.innerHTML='<div class="skeleton" style="height:100px;border-radius:var(--radius-md)"></div>';
    try{
      const snap=await db.collection(COLL.orders).where('customer','==',name).orderBy('createdAt','desc').limit(20).get();
      const orders=snap.docs.map(d=>({id:d.id,...d.data()}));
      if(!orders.length){container.innerHTML='<div class="empty-state"><div class="empty-icon">📦</div><p>Aún no tienes pedidos</p></div>';return;}
      const icons={pending:'⏳',done:'✅',rejected:'❌'};
      const labels={pending:'Pendiente',done:'Completado',rejected:'Rechazado'};
      container.innerHTML=orders.map(o=>{
        const date=o.createdAt?.toDate?o.createdAt.toDate().toLocaleString('es-PE',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'';
        const items=(o.items||[]).map(i=>i.name+' ×'+i.qty).join(', ');
        return `<div class="order-history-item"><div class="oh-header"><span style="font-weight:700;font-size:.84rem">${date}</span><span class="oh-status ${o.status}">${icons[o.status]||''} ${labels[o.status]||o.status}</span></div><p style="color:var(--text-2);font-size:.8rem;margin:.2rem 0">${items}</p><p style="font-weight:800;color:var(--accent);font-size:.88rem">${APP_CONFIG.currency} ${(o.total||0).toFixed(2)}</p></div>`;
      }).join('');
    }catch(err){container.innerHTML='<div class="empty-state"><p>Error al cargar historial</p></div>';}
  }
  function bindAdminBtn(){
    document.getElementById('loginBtn')?.addEventListener('click',()=>showPage(page==='admin'?'store':'admin'));
    document.getElementById('backToStoreBtn')?.addEventListener('click',()=>showPage('store'));
    document.getElementById('logoutBtn')?.addEventListener('click',()=>{
      if(!confirm('¿Cerrar sesión de administrador?'))return;
      Auth.signOut().then(()=>{showPage('store');showToast('Sesión cerrada','info');});
    });
  }
  function init(){
    initTheme();loadBranding();bindLoginModal();bindProfileModal();bindAdminBtn();
    if(window.Store)Store.init();if(window.Cart)Cart.init();if(window.UIHelpers)UIHelpers.init();
    showPage('store');
  }
  return{init,showPage,updateProfileBtn};
})();
document.addEventListener('DOMContentLoaded',()=>App.init());
