#!/usr/bin/env node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let checks = 0;

function assert(condition, message) {
  checks += 1;
  if (!condition) throw new Error(message);
}

async function read(relative) {
  return fs.readFile(path.join(root, relative), 'utf8');
}

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', shell: false });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} falló:\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

function nodeCheck(relative) {
  run(process.execPath, ['--check', path.join(root, relative)]);
  assert(true, `Sintaxis Node inválida en ${relative}`);
}

function loadTypeScript() {
  const candidates = [
    'typescript',
    '/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'
  ];
  for (const candidate of candidates) {
    try { return require(candidate); } catch { /* try next */ }
  }
  throw new Error('No se encontró TypeScript para validar JSX. Instala TypeScript o ejecuta npm install en el paquete raíz.');
}

async function validateJsx(relativeFiles) {
  const ts = loadTypeScript();
  for (const relative of relativeFiles) {
    const source = await read(relative);
    const output = ts.transpileModule(source, {
      fileName: relative,
      reportDiagnostics: true,
      compilerOptions: {
        allowJs: true,
        checkJs: false,
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022
      }
    });
    const errors = (output.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error);
    assert(errors.length === 0, `JSX inválido en ${relative}: ${errors.map(item => ts.flattenDiagnosticMessageText(item.messageText, '; ')).join('; ')}`);
  }
}

async function staticChecks() {
  const web = await read('web/js/kiosco-final-improvements.js');
  const receipts = await read('web/js/kiosco-receipts-appearance.js');
  const modal = await read('kiosco-app/src/components/OrderModal.js');
  const service = await read('kiosco-app/src/services/orderService.js');
  const receiptService = await read('kiosco-app/src/services/receiptService.js');
  const installer = await read('scripts/apply-final-improvements.mjs');
  const css = await read('web/css/kiosco-final-improvements.css');
  const readme = await read('README.md');

  assert(web.includes('kAddCategoryInline'), 'Falta el botón + de categoría');
  assert(web.includes('kAddSubcategoryInline'), 'Falta el botón + de subcategoría');
  assert(web.includes("db.collection(COLL.categories).add"), 'Falta la creación Firestore de categorías');
  assert(web.includes('waitForOption'), 'Falta la selección de la categoría creada en tiempo real');
  assert(web.includes('kPaymentProofFile'), 'Falta el selector de imagen de pago web');
  assert(web.includes('notes.maxLength = 300'), 'Falta el límite web de 300 caracteres');
  assert(web.includes('paymentProofs'), 'Falta guardar comprobantes web');

  assert(receipts.includes('data-receipt-period="today"'), 'Falta filtro Hoy');
  assert(receipts.includes('data-receipt-period="week"'), 'Falta filtro Semana');
  assert(receipts.includes('data-receipt-period="month"'), 'Falta filtro Mes');
  assert(receipts.includes('Imprimir / guardar PDF'), 'Falta la opción de imprimir recibo');
  assert(receipts.includes('prepareReceiptPopup'), 'Falta la apertura segura del recibo antes del proceso asíncrono');
  assert(receipts.includes('reserveReceiptClientSide'), 'Falta el recibo sin backend');
  assert(receipts.includes('data-view-proof'), 'Falta visualizar el comprobante de pago');
  assert(receipts.includes('window.print()'), 'Falta impresión desde el navegador');

  assert(modal.includes("from 'expo-image-picker'"), 'Falta expo-image-picker');
  assert(modal.includes("value: 'card'"), 'Falta Tarjeta en Expo');
  assert(modal.includes("value: 'yape'"), 'Falta Yape en Expo');
  assert(modal.includes("value: 'plin'"), 'Falta Plin en Expo');
  assert(modal.includes('maxLength={300}'), 'Falta límite de notas en Expo');
  assert(modal.includes('paymentProof'), 'Falta el comprobante en Expo');
  assert(service.includes("doc(db, 'paymentProofs'"), 'Falta guardar el comprobante desde Expo');
  assert(service.includes('paymentProofExpected'), 'Falta registrar la expectativa de comprobante');
  assert(receiptService.includes('EXPO_PUBLIC_KIOSCO_STORE_URL'), 'Falta el fallback de Firebase Hosting en Expo');

  assert(installer.includes('KIOSCO_FINAL:PAYMENT_PROOFS'), 'Falta parche de reglas para comprobantes');
  assert(installer.includes("'kiosco-api/**'"), 'Falta excluir el backend de Firebase Hosting');
  assert(installer.includes("'kiosco-app/**'"), 'Falta excluir Expo de Firebase Hosting');
  assert(installer.includes('linkedOrder().paymentProofExpected == true'), 'Las reglas no vinculan el comprobante al pedido');
  assert(installer.includes("paymentMethod: window.KioscoFinalImprovements"), 'Falta insertar el método de pago en la transacción web');
  assert(css.includes('.kiosk-print-toolbar'), 'Falta CSS del recibo imprimible');
  assert(css.includes('.kiosk-category-input-group'), 'Falta CSS del botón +');
  assert(readme.includes('npx expo install expo-image-picker'), 'README no documenta expo-image-picker');
  assert(readme.includes('Hoy'), 'README no documenta filtros');
}

async function createMockTarget() {
  const target = await fs.mkdtemp(path.join(os.tmpdir(), 'kiosco-final-verify-'));
  await fs.mkdir(path.join(target, 'js'), { recursive: true });
  await fs.mkdir(path.join(target, 'css'), { recursive: true });
  await fs.mkdir(path.join(target, 'kiosco-app', 'src', 'components'), { recursive: true });
  await fs.mkdir(path.join(target, 'kiosco-app', 'src', 'services'), { recursive: true });

  await fs.writeFile(path.join(target, 'index.html'), '<!doctype html><html><head></head><body><main>Kiosco</main></body></html>');
  await fs.writeFile(path.join(target, 'firebase.json'), JSON.stringify({ hosting: { public: '.', ignore: ['firebase.json', '**/.*', '**/node_modules/**'] } }, null, 2));
  await fs.writeFile(path.join(target, 'sw.js'), `const APP_VERSION = 'old';\nconst APP_SHELL = ['/','/index.html'];\n`);
  await fs.writeFile(path.join(target, '.gitignore'), 'node_modules/\n');
  await fs.writeFile(path.join(target, 'js', 'kiosco-receipts-appearance.js'), "console.log('old receipts');\n");
  await fs.writeFile(path.join(target, 'js', 'cart.js'), `const Cart = (() => {\n  async function checkout() {\n    const orderReference = { id: 'abc' };\n    const data = {\n      status: 'pending',\n      // KIOSCO_UPGRADES:PAYMENT_METHOD\n      paymentMethod: window.KioscoUpgrades?.getSelectedPaymentMethod?.() || 'cash',\n      notes: String(notes || '').trim() || null,\n    };\n    return orderReference.id;\n  }\n  return { checkout };\n})();\nwindow.Cart = Cart;\n`);
  await fs.writeFile(path.join(target, 'firestore.rules'), `rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    function isAdmin() { return request.auth != null; }\n    match /orders/{orderId} { allow read: if true; allow write: if isAdmin(); }\n    match /{document=**} { allow read, write: if false; }\n  }\n}\n`);
  await fs.writeFile(path.join(target, 'kiosco-app', 'App.js'), `import React from 'react';\nasync function send(data, cart) {\n  const orderId = await createOrder({ ...data, cart });\n  Alert.alert('Pedido enviado', \`Tu pedido \${orderId.slice(-8)} fue registrado correctamente.\`);\n}\nexport default function App(){ return null; }\n`);
  await fs.writeFile(path.join(target, 'kiosco-app', 'src', 'components', 'OrderModal.js'), 'export default function OrderModal(){ return null; }\n');
  return target;
}

function count(text, token) {
  return text.split(token).length - 1;
}

async function installerTest() {
  const target = await createMockTarget();
  try {
    run(process.execPath, [path.join(root, 'scripts', 'apply-final-improvements.mjs'), target]);
    run(process.execPath, [path.join(root, 'scripts', 'apply-final-improvements.mjs'), target]);

    const index = await fs.readFile(path.join(target, 'index.html'), 'utf8');
    const cart = await fs.readFile(path.join(target, 'js', 'cart.js'), 'utf8');
    const rules = await fs.readFile(path.join(target, 'firestore.rules'), 'utf8');
    const serviceWorker = await fs.readFile(path.join(target, 'sw.js'), 'utf8');
    const app = await fs.readFile(path.join(target, 'kiosco-app', 'App.js'), 'utf8');
    const gitignore = await fs.readFile(path.join(target, '.gitignore'), 'utf8');
    const firebaseConfig = JSON.parse(await fs.readFile(path.join(target, 'firebase.json'), 'utf8'));

    assert(count(index, 'css/kiosco-final-improvements.css') === 1, 'El CSS se duplicó en index.html');
    assert(count(index, 'js/kiosco-final-improvements.js') === 1, 'El JS se duplicó en index.html');
    assert(count(cart, 'KIOSCO_FINAL:CHECKOUT_EXTRAS') === 1, 'Los campos del pedido se duplicaron');
    assert(cart.includes("slice(0, 300)"), 'El instalador no limitó las notas web');
    assert(count(rules, 'KIOSCO_FINAL:PAYMENT_PROOFS') === 1, 'Las reglas de comprobantes se duplicaron');
    assert(rules.includes('exists(/databases/$(database)/documents/orders/$(orderId))'), 'Las reglas no validan la existencia del pedido');
    assert(count(serviceWorker, '/js/kiosco-final-improvements.js') === 1, 'El recurso JS se duplicó en el Service Worker');
    assert(count(serviceWorker, '/css/kiosco-final-improvements.css') === 1, 'El recurso CSS se duplicó en el Service Worker');
    assert(count(app, 'KIOSCO_FINAL:ORDER_RESULT') === 1, 'El resultado de pedido Expo se duplicó');
    assert(gitignore.includes('.kiosco-final-backup-*'), 'Falta ignorar respaldos');
    assert(firebaseConfig.hosting.ignore.includes('kiosco-api/**'), 'Firebase Hosting publicaría kiosco-api');
    assert(firebaseConfig.hosting.ignore.includes('kiosco-app/**'), 'Firebase Hosting publicaría kiosco-app');
    assert(firebaseConfig.hosting.ignore.includes('firestore.rules'), 'Firebase Hosting publicaría las reglas');
    assert(await fs.stat(path.join(target, 'docs', 'kiosco-mejoras-finales', 'README.md')), 'No se copió la documentación');

    const backups = (await fs.readdir(target)).filter(name => name.startsWith('.kiosco-final-backup-'));
    assert(backups.length >= 1, 'No se creó respaldo');
  } finally {
    await fs.rm(target, { recursive: true, force: true });
  }
}

async function main() {
  nodeCheck('web/js/kiosco-final-improvements.js');
  nodeCheck('web/js/kiosco-receipts-appearance.js');
  nodeCheck('scripts/apply-final-improvements.mjs');
  nodeCheck('scripts/verify-package.mjs');

  await validateJsx([
    'kiosco-app/src/components/OrderModal.js',
    'kiosco-app/src/services/orderService.js',
    'kiosco-app/src/services/receiptService.js'
  ]);
  await staticChecks();
  await installerTest();
  console.log(`Validación correcta: ${checks} comprobaciones.`);
}

main().catch(error => {
  console.error(`VALIDATION ERROR: ${error.message}`);
  process.exit(1);
});
