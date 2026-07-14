// js/firebase.js — Firebase initialization
(function () {
  if (!window.FIREBASE_CONFIG) {
    console.error('FIREBASE_CONFIG not defined');
    return;
  }
  try {
    firebase.initializeApp(window.FIREBASE_CONFIG);
    window.db = firebase.firestore();
    window.auth = firebase.auth();
    window.COLL = {
      products: 'products', categories: 'categories',
      orders: 'orders', config: 'config', chats: 'chats', audit: 'audit_log'
    };
    window.FS = firebase.firestore;
    window.db.enablePersistence({ synchronizeTabs: true }).catch(() => { });
  } catch (e) {
    console.error('Firebase init error:', e.message);
  }
})();
