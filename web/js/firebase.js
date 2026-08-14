'use strict';

(function initializeFirebase() {
  if (!window.FIREBASE_CONFIG) {
    console.error('FIREBASE_CONFIG no está definido');
    return;
  }

  try {
    const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(window.FIREBASE_CONFIG);
    window.db = app.firestore();
    window.auth = app.auth();
    window.storage = typeof app.storage === 'function' ? app.storage() : null;
    window.COLL = {
      products: 'products',
      categories: 'categories',
      orders: 'orders',
      config: 'config',
      chats: 'chats',
      audit: 'audit_log',
      expenses: 'expenses' // KIOSCO_NINE:EXPENSES_COLLECTION
    };
    window.FS = firebase.firestore;

    window.db.enablePersistence({ synchronizeTabs: true }).catch(error => {
      if (!['failed-precondition', 'unimplemented'].includes(error?.code)) {
        console.warn('Persistencia de Firestore:', error?.message || error);
      }
    });
  } catch (error) {
    console.error('Error al iniciar Firebase:', error?.message || error);
  }
})();
