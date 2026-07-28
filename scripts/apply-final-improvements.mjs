#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDirectory, '..');
const targetArgument = process.argv.slice(2).find(value => !value.startsWith('--'));
const dryRun = process.argv.includes('--dry-run');

if (!targetArgument) {
  console.error('Uso: node scripts/apply-final-improvements.mjs /ruta/al/repositorio/mi-kiosco [--dry-run]');
  process.exit(1);
}

const targetRoot = path.resolve(targetArgument);
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(targetRoot, `.kiosco-final-backup-${timestamp}`);

async function exists(filePath) {
  try { await fs.access(filePath); return true; } catch { return false; }
}

async function backup(relativePath) {
  const source = path.join(targetRoot, relativePath);
  if (!await exists(source)) return;
  const destination = path.join(backupRoot, relativePath);
  console.log(`[backup] ${relativePath}`);
  if (dryRun) return;
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const stat = await fs.stat(source);
  if (stat.isDirectory()) await fs.cp(source, destination, { recursive: true, force: true });
  else await fs.copyFile(source, destination);
}

async function copy(sourceRelative, targetRelative) {
  const source = path.join(packageRoot, sourceRelative);
  const destination = path.join(targetRoot, targetRelative);
  console.log(`[copy] ${targetRelative}`);
  if (dryRun) return;
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
}

async function writeIfChanged(filePath, original, next) {
  if (original === next) {
    console.log(`[ok] ${path.relative(targetRoot, filePath)}`);
    return;
  }
  console.log(`[patch] ${path.relative(targetRoot, filePath)}`);
  if (!dryRun) await fs.writeFile(filePath, next, 'utf8');
}

async function patchFirebaseJson() {
  const filePath = path.join(targetRoot, 'firebase.json');
  if (!await exists(filePath)) return;
  const original = await fs.readFile(filePath, 'utf8');
  let config;
  try {
    config = JSON.parse(original);
  } catch (error) {
    throw new Error(`firebase.json no es JSON válido: ${error.message}`);
  }

  const hostingConfigs = Array.isArray(config.hosting) ? config.hosting : [config.hosting].filter(Boolean);
  const requiredIgnores = [
    'firebase.json',
    '**/.*',
    '**/node_modules/**',
    'kiosco-api/**',
    'kiosco-app/**',
    'docs/**',
    'scripts/**',
    'web-upgrade/**',
    'package.json',
    'package-lock.json',
    'README.md',
    'MANIFEST.txt',
    'CHECKSUMS.sha256',
    'firestore.rules',
    'firestore.indexes.json',
    'storage.rules'
  ];

  for (const hosting of hostingConfigs) {
    const current = Array.isArray(hosting.ignore) ? hosting.ignore : [];
    hosting.ignore = [...new Set([...current, ...requiredIgnores])];
  }

  const next = `${JSON.stringify(config, null, 2)}
`;
  await writeIfChanged(filePath, original, next);
}

async function patchIndex() {
  const filePath = path.join(targetRoot, 'index.html');
  const original = await fs.readFile(filePath, 'utf8');
  let next = original;
  if (!next.includes('css/kiosco-final-improvements.css')) {
    next = next.replace(/<\/head>/i, '  <!-- KIOSCO_FINAL:CSS -->\n  <link rel="stylesheet" href="css/kiosco-final-improvements.css">\n</head>');
  }
  if (!next.includes('js/kiosco-final-improvements.js')) {
    next = next.replace(/<\/body>/i, '  <!-- KIOSCO_FINAL:JS -->\n  <script src="js/kiosco-final-improvements.js"></script>\n</body>');
  }
  await writeIfChanged(filePath, original, next);
}

async function patchCart() {
  const filePath = path.join(targetRoot, 'js', 'cart.js');
  const original = await fs.readFile(filePath, 'utf8');
  let next = original;
  const block = `// KIOSCO_FINAL:CHECKOUT_EXTRAS
          paymentMethod: window.KioscoFinalImprovements?.getCheckoutExtras?.().paymentMethod
            || window.KioscoUpgrades?.getSelectedPaymentMethod?.()
            || 'cash',
          paymentGroup: window.KioscoFinalImprovements?.getCheckoutExtras?.().paymentGroup || null,
          paymentProofExpected: Boolean(window.KioscoFinalImprovements?.getCheckoutExtras?.().paymentProofExpected),`;

  if (next.includes('// KIOSCO_FINAL:CHECKOUT_EXTRAS')) {
    console.log('[ok] js/cart.js checkout extras ya presentes');
  } else if (next.includes('// KIOSCO_UPGRADES:PAYMENT_METHOD')) {
    next = next.replace(
      /\s*\/\/ KIOSCO_UPGRADES:PAYMENT_METHOD\r?\n\s*paymentMethod:[^\n]+,\r?\n/m,
      `\n          ${block}\n`
    );
  } else {
    const pattern = /(status\s*:\s*['"]pending['"]\s*,)(\r?\n)([ \t]*)/m;
    if (!pattern.test(next)) throw new Error('No se encontró status: pending en js/cart.js');
    next = next.replace(pattern, `$1$2$3${block}$2$3`);
  }

  next = next.replace(
    /notes:\s*String\(notes\s*\|\|\s*['"]['"]\)\.trim\(\)\s*\|\|\s*null,/,
    "notes: String(notes || '').trim().slice(0, 300) || null,"
  );
  await writeIfChanged(filePath, original, next);
}

async function patchExpoApp() {
  const filePath = path.join(targetRoot, 'kiosco-app', 'App.js');
  const original = await fs.readFile(filePath, 'utf8');
  let next = original;
  if (!next.includes('KIOSCO_FINAL:ORDER_RESULT')) {
    const oldLine = 'const orderId = await createOrder({ ...data, cart });';
    if (!next.includes(oldLine)) throw new Error('No se encontró createOrder en kiosco-app/App.js');
    next = next.replace(oldLine, `// KIOSCO_FINAL:ORDER_RESULT
      const orderResult = await createOrder({ ...data, cart });
      const orderId = typeof orderResult === 'string' ? orderResult : orderResult.orderId;
      const proofWarning = typeof orderResult === 'object' ? orderResult.proofWarning : '';`);
    next = next.replace(
      "Alert.alert('Pedido enviado', `Tu pedido ${orderId.slice(-8)} fue registrado correctamente.`);",
      "Alert.alert('Pedido enviado', `Tu pedido ${orderId.slice(-8)} fue registrado correctamente.${proofWarning ? `\\n\\n${proofWarning}` : ''}`);"
    );
  }
  await writeIfChanged(filePath, original, next);
}

function addShellAssets(content) {
  const match = content.match(/const\s+(APP_SHELL|SHELL)\s*=\s*\[([\s\S]*?)\];/m);
  if (!match) return content;
  const assets = [...match[2].matchAll(/["']([^"']+)["']/g)].map(item => item[1]);
  for (const asset of ['/css/kiosco-final-improvements.css', '/js/kiosco-final-improvements.js']) {
    if (!assets.includes(asset)) assets.push(asset);
  }
  return content.replace(match[0], `const ${match[1]} = [\n${assets.map(asset => `  '${asset}'`).join(',\n')}\n];`);
}

async function patchServiceWorker() {
  const filePath = path.join(targetRoot, 'sw.js');
  if (!await exists(filePath)) return;
  const original = await fs.readFile(filePath, 'utf8');
  let next = addShellAssets(original);
  if (/const\s+APP_VERSION\s*=\s*["'][^"']+["'];/.test(next)) {
    next = next.replace(/const\s+APP_VERSION\s*=\s*["'][^"']+["'];/, "const APP_VERSION = 'kiosco-final-improvements-1';");
  } else if (/const\s+CACHE\s*=\s*["'][^"']+["'];/.test(next)) {
    next = next.replace(/const\s+CACHE\s*=\s*["'][^"']+["'];/, "const CACHE = 'kiosco-final-improvements-1';");
  }
  await writeIfChanged(filePath, original, next);
}

async function patchFirestoreRules() {
  const filePath = path.join(targetRoot, 'firestore.rules');
  const original = await fs.readFile(filePath, 'utf8');
  let next = original;
  if (!next.includes('KIOSCO_FINAL:PAYMENT_PROOFS')) {
    const insertion = `

    // KIOSCO_FINAL:PAYMENT_PROOFS
    match /paymentProofs/{orderId} {
      function linkedOrder() {
        return get(/databases/$(database)/documents/orders/$(orderId)).data;
      }

      // El cliente público solo puede crear una imagen comprimida para un pedido
      // que acaba de registrar y que declaró esperar un comprobante.
      allow create: if (isAdmin() || (
          request.auth == null
          && exists(/databases/$(database)/documents/orders/$(orderId))
          && linkedOrder().paymentProofExpected == true
          && linkedOrder().paymentMethod == request.resource.data.paymentMethod
        ))
        && request.resource.data.keys().hasOnly([
          'orderId', 'paymentMethod', 'imageData', 'fileName',
          'contentType', 'originalType', 'encodedLength', 'createdAt'
        ])
        && request.resource.data.orderId == orderId
        && request.resource.data.paymentMethod in ['card', 'yape', 'plin']
        && request.resource.data.imageData is string
        && request.resource.data.imageData.size() > 100
        && request.resource.data.imageData.size() <= 420000
        && request.resource.data.fileName is string
        && request.resource.data.fileName.size() <= 120
        && request.resource.data.contentType is string
        && request.resource.data.contentType.matches('image/.*')
        && request.resource.data.encodedLength is int
        && request.resource.data.encodedLength > 100
        && request.resource.data.encodedLength <= 420000;
      allow read, update, delete: if isAdmin();
    }
`;
    const catchAll = /\n\s*match\s+\/\{document=\*\*\}\s*\{/m;
    const catchAllAlt = /\n\s*match\s+\/\{allPaths=\*\*\}\s*\{/m;
    if (catchAll.test(next)) next = next.replace(catchAll, `${insertion}$&`);
    else if (catchAllAlt.test(next)) next = next.replace(catchAllAlt, `${insertion}$&`);
    else {
      const serviceEnd = next.lastIndexOf('\n  }');
      if (serviceEnd < 0) throw new Error('No se encontró el cierre de firestore.rules');
      next = `${next.slice(0, serviceEnd)}${insertion}${next.slice(serviceEnd)}`;
    }
  }
  await writeIfChanged(filePath, original, next);
}

async function ensureGitignore() {
  const filePath = path.join(targetRoot, '.gitignore');
  const original = await exists(filePath) ? await fs.readFile(filePath, 'utf8') : '';
  let next = original;
  if (!next.split(/\r?\n/).includes('.kiosco-final-backup-*')) next = `${next.trimEnd()}\n.kiosco-final-backup-*\n`;
  await writeIfChanged(filePath, original, next);
}

async function main() {
  const required = [
    'index.html', 'firebase.json', 'sw.js', 'firestore.rules', 'js/cart.js',
    'js/kiosco-receipts-appearance.js', 'kiosco-app/App.js',
    'kiosco-app/src/components/OrderModal.js'
  ];
  for (const item of required) {
    if (!await exists(path.join(targetRoot, item))) throw new Error(`Falta ${item}. Aplica primero las mejoras anteriores.`);
  }

  console.log(`${dryRun ? '[dry-run] ' : ''}Destino: ${targetRoot}`);
  if (!dryRun) await fs.mkdir(backupRoot, { recursive: true });
  for (const item of [
    'index.html', 'firebase.json', 'sw.js', 'firestore.rules', '.gitignore', 'js/cart.js',
    'js/kiosco-receipts-appearance.js', 'js/kiosco-final-improvements.js',
    'css/kiosco-final-improvements.css', 'kiosco-app/App.js',
    'kiosco-app/src/components/OrderModal.js',
    'kiosco-app/src/services/orderService.js',
    'kiosco-app/src/services/receiptService.js',
    'kiosco-app/.env.example'
  ]) await backup(item);

  await copy('web/js/kiosco-receipts-appearance.js', 'js/kiosco-receipts-appearance.js');
  await copy('web/js/kiosco-final-improvements.js', 'js/kiosco-final-improvements.js');
  await copy('web/css/kiosco-final-improvements.css', 'css/kiosco-final-improvements.css');
  await copy('kiosco-app/src/components/OrderModal.js', 'kiosco-app/src/components/OrderModal.js');
  await copy('kiosco-app/src/services/orderService.js', 'kiosco-app/src/services/orderService.js');
  await copy('kiosco-app/src/services/receiptService.js', 'kiosco-app/src/services/receiptService.js');
  await copy('kiosco-app/.env.example', 'kiosco-app/.env.example');
  await copy('README.md', 'docs/kiosco-mejoras-finales/README.md');

  await patchFirebaseJson();
  await patchIndex();
  await patchCart();
  await patchExpoApp();
  await patchServiceWorker();
  await patchFirestoreRules();
  await ensureGitignore();

  console.log('\nMejoras finales aplicadas.');
  console.log('1. Ejecuta npx expo install expo-image-picker dentro de kiosco-app.');
  console.log('2. Ejecuta npx expo-doctor.');
  console.log('3. Revisa y despliega firestore.rules.');
  console.log('4. Reinicia Hosting y Expo con caché limpia.');
}

main().catch(error => {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
});
