'use strict';

(() => {
  if (window.__KIOSCO_FIRESTORE_IMAGES_ACTIVE || window.__KIOSCO_FIRESTORE_IMAGES_LOADING) return;
  window.__KIOSCO_FIRESTORE_IMAGES_LOADING = true;
  const script = document.createElement('script');
  script.src = 'js/kiosco-firestore-images.js?build=20260818-firestore-images-fix';
  script.async = false;
  script.dataset.kioscoFirestoreImages = 'true';
  script.addEventListener('error', () => {
    window.__KIOSCO_FIRESTORE_IMAGES_LOADING = false;
    console.error('No se pudo cargar el módulo Firestore de imágenes.');
  });
  document.body.append(script);
})();
