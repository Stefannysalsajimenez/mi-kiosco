// js/config.js
// ⚠️  NO subas este archivo a GitHub con tus credenciales reales.
// Agrega  js/config.js  a tu .gitignore

window.FIREBASE_CONFIG = {
  apiKey:            "AIzaSyBxUkvJ2D4rfXwgHDDlRl-u7AwBwEU4JK8",
  authDomain:        "mi-kiosco-c7313.firebaseapp.com",
  projectId:         "mi-kiosco-c7313",
  storageBucket:     "mi-kiosco-c7313.firebasestorage.app",
  messagingSenderId: "37917095726",
  appId:             "1:37917095726:web:875e605022814ec95c6cbf"
};

// El número de admin se guarda SOLO en Firestore:
// Nunca lo pongas aquí.

window.APP_CONFIG = {
  storeName:    "Kiosco",
  currency:     "S/",
  currencyCode: "PEN",
  phoneCountry: "+51"
};

// Configuracion general de mejoras integradas
window.KIOSCO_UPGRADE_CONFIG = Object.freeze({
  apiBaseUrl: '',
  mediaApiBaseUrl: '',
  firebaseVapidKey: '',
  enableCallMeBot: false,
  storeUrl: 'https://mi-kiosco-c7313.web.app',
  imageStorage: 'product-inline-base64',
  systemVersion: '1.27.2'
});
