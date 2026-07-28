// js/auth.js — Authentication: client (localStorage) + admin (Firebase phone)
const Auth = (() => {
  const K = { name: 'kk_name', phone: 'kk_phone', role: 'kk_role' };
  let adminPhones = [];
  let recaptcha = null;
  let confirmResult = null;

  async function loadAdminPhones() {
    if (adminPhones.length) return adminPhones;
    try {
      const doc = await db.collection(COLL.config).doc('admin').get();
      if (doc.exists) {
        const d = doc.data();
        adminPhones = Array.isArray(d.phones) ? d.phones : (d.phone ? [d.phone] : []);
      }
    } catch (e) { console.warn('loadAdminPhones:', e.message); }
    return adminPhones;
  }

  function initRecaptcha(containerId) {
    if (recaptcha) return;
    try {
      recaptcha = new firebase.auth.RecaptchaVerifier(containerId, {
        size: 'invisible', callback: () => { }
      });
    } catch (e) { console.warn('Recaptcha init:', e.message); }
  }

  async function sendCode(digits, containerId = 'recaptchaContainer') {
    initRecaptcha(containerId);
    const phone = (window.APP_CONFIG?.phoneCountry || '+51') + digits.replace(/\D/g, '');
    confirmResult = await auth.signInWithPhoneNumber(phone, recaptcha);
    return phone;
  }

  async function verifyCode(code) {
    if (!confirmResult) throw new Error('No hay código pendiente');
    const { user } = await confirmResult.confirm(code);
    return user;
  }

  async function checkIsAdmin(user) {
    await loadAdminPhones();
    return !!(user && adminPhones.includes(user.phoneNumber));
  }

  // Client login — no Firebase Auth needed
  function loginClient(name, phone) {
    localStorage.setItem(K.name, name);
    localStorage.setItem(K.phone, phone || '');
    localStorage.setItem(K.role, 'client');
  }

  function logout() {
    localStorage.removeItem(K.name);
    localStorage.removeItem(K.phone);
    localStorage.removeItem(K.role);
    return auth.signOut().catch(() => { });
  }

  function getClientName() { return localStorage.getItem(K.name) || ''; }
  function getClientPhone() { return localStorage.getItem(K.phone) || ''; }
  function getRole() { return localStorage.getItem(K.role) || ''; }
  function isClient() { return getRole() === 'client'; }
  function isLoggedIn() { return !!getRole() || !!auth.currentUser; }

  function onAuthChange(cb) { return auth.onAuthStateChanged(cb); }

  return {
    loadAdminPhones, sendCode, verifyCode, checkIsAdmin,
    loginClient, logout,
    getClientName, getClientPhone, getRole, isClient, isLoggedIn,
    onAuthChange
  };
})();
