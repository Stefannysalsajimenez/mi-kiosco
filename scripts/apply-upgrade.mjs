#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const targetArg = args.find(arg => !arg.startsWith('--'));

if (!targetArg) {
  console.error('Uso: node scripts/apply-upgrade.mjs /ruta/al/repositorio/mi-kiosco [--dry-run]');
  process.exit(1);
}

const targetRoot = path.resolve(targetArg);
const backupRoot = path.join(targetRoot, '.kiosco-upgrade-backup');

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function relativeTarget(filePath) {
  return path.relative(targetRoot, filePath) || '.';
}

async function ensureDirectory(directory) {
  if (dryRun) return;
  await fs.mkdir(directory, { recursive: true });
}

async function backupPath(sourcePath) {
  if (!await exists(sourcePath)) return;
  const relative = path.relative(targetRoot, sourcePath);
  const destination = path.join(backupRoot, relative);
  if (await exists(destination)) return;
  console.log(`[backup] ${relative}`);
  if (dryRun) return;
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const stat = await fs.stat(sourcePath);
  if (stat.isDirectory()) {
    await fs.cp(sourcePath, destination, { recursive: true, force: false, errorOnExist: false });
  } else {
    await fs.copyFile(sourcePath, destination);
  }
}

async function copyPath(sourcePath, destinationPath) {
  console.log(`[copy] ${relativeTarget(destinationPath)}`);
  if (dryRun) return;
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  const stat = await fs.stat(sourcePath);
  if (stat.isDirectory()) {
    await fs.cp(sourcePath, destinationPath, { recursive: true, force: true });
  } else {
    await fs.copyFile(sourcePath, destinationPath);
  }
}

async function writeChanged(filePath, original, next) {
  if (next === original) {
    console.log(`[ok] ${relativeTarget(filePath)} ya estaba actualizado`);
    return;
  }
  console.log(`[patch] ${relativeTarget(filePath)}`);
  if (!dryRun) await fs.writeFile(filePath, next, 'utf8');
}

function insertAfter(content, pattern, insertion, description) {
  const match = content.match(pattern);
  if (!match) throw new Error(`No se encontró el punto de inserción: ${description}`);
  const index = match.index + match[0].length;
  return `${content.slice(0, index)}${insertion}${content.slice(index)}`;
}

async function patchIndex() {
  const filePath = path.join(targetRoot, 'index.html');
  const original = await fs.readFile(filePath, 'utf8');
  let next = original;

  if (!next.includes('KIOSCO_UPGRADES:CSS')) {
    next = insertAfter(
      next,
      /<link\s+rel=["']stylesheet["']\s+href=["']css\/app\.css["']\s*\/?>/i,
      `\n  <!-- KIOSCO_UPGRADES:CSS -->\n  <link rel="stylesheet" href="css/kiosco-upgrades.css" />\n  <!-- /KIOSCO_UPGRADES:CSS -->`,
      'css/app.css'
    );
  }

  if (!next.includes('KIOSCO_UPGRADES:MESSAGING')) {
    next = insertAfter(
      next,
      /<script\s+src=["']https:\/\/www\.gstatic\.com\/firebasejs\/10\.7\.1\/firebase-storage-compat\.js["']><\/script>/i,
      `\n  <!-- KIOSCO_UPGRADES:MESSAGING -->\n  <script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js"></script>\n  <!-- /KIOSCO_UPGRADES:MESSAGING -->`,
      'firebase-storage-compat.js'
    );
  }

  if (!next.includes('KIOSCO_UPGRADES:SCRIPTS')) {
    next = insertAfter(
      next,
      /<script\s+src=["']js\/app\.js["']><\/script>/i,
      `\n  <!-- KIOSCO_UPGRADES:SCRIPTS -->\n  <script src="js/kiosco-upgrade-config.js"></script>\n  <script src="js/kiosco-upgrades.js"></script>\n  <!-- /KIOSCO_UPGRADES:SCRIPTS -->`,
      'js/app.js'
    );
  }

  await writeChanged(filePath, original, next);
}

async function patchCartCheckout() {
  const filePath = path.join(targetRoot, 'js', 'cart.js');
  const original = await fs.readFile(filePath, 'utf8');
  let next = original;

  if (!next.includes('KIOSCO_UPGRADES:PAYMENT_METHOD')) {
    const pattern = /(status\s*:\s*['"]pending['"]\s*,)(\r?\n)([ \t]*)/m;
    const match = next.match(pattern);
    if (!match) {
      throw new Error('No se encontró el objeto de creación del pedido en js/cart.js');
    }
    next = next.replace(
      pattern,
      `$1$2$3// KIOSCO_UPGRADES:PAYMENT_METHOD$2$3paymentMethod: window.KioscoUpgrades?.getSelectedPaymentMethod?.() || 'cash',$2$3`
    );
  }

  await writeChanged(filePath, original, next);
}


async function patchCashDateKey() {
  const filePath = path.join(targetRoot, 'js', 'admin.js');
  const original = await fs.readFile(filePath, 'utf8');
  let next = original;

  if (!next.includes('KIOSCO_UPGRADES:CASH_DATE_KEY')) {
    const pattern = /const\s+KEY\s*=\s*['"]kk_caja_['"]\s*\+\s*new\s+Date\(\)\.toISOString\(\)\.slice\(0,\s*10\);/;
    if (!pattern.test(next)) {
      throw new Error('No se encontró la clave diaria de caja en js/admin.js');
    }
    next = next.replace(
      pattern,
      `// KIOSCO_UPGRADES:CASH_DATE_KEY
    const KEY = 'kk_caja_' + new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());`
    );
  }

  await writeChanged(filePath, original, next);
}

function patchShellAssets(content) {
  const match = content.match(/const\s+(APP_SHELL|SHELL)\s*=\s*\[([\s\S]*?)\];/m);
  if (!match) throw new Error('No se encontró APP_SHELL o SHELL en sw.js');
  const variableName = match[1];
  const assets = [...match[2].matchAll(/["']([^"']+)["']/g)].map(item => item[1]);
  const required = [
    '/css/kiosco-upgrades.css',
    '/js/kiosco-upgrade-config.js',
    '/js/kiosco-upgrades.js'
  ];
  for (const asset of required) {
    if (!assets.includes(asset)) assets.push(asset);
  }
  const replacement = `const ${variableName} = [${assets.map(asset => `'${asset}'`).join(', ')}];`;
  return content.replace(match[0], replacement);
}

function bumpServiceWorkerVersion(content) {
  if (/const\s+APP_VERSION\s*=\s*["'][^"']+["'];/.test(content)) {
    return content.replace(
      /const\s+APP_VERSION\s*=\s*["'][^"']+["'];/,
      "const APP_VERSION = 'kiosco-upgrades-1';"
    );
  }
  if (/const\s+CACHE\s*=\s*["'][^"']+["'];/.test(content)) {
    return content.replace(
      /const\s+CACHE\s*=\s*["'][^"']+["'];/,
      "const CACHE = 'kiosco-upgrades-1';"
    );
  }
  throw new Error('No se encontró APP_VERSION o CACHE en sw.js');
}

async function patchServiceWorker() {
  const filePath = path.join(targetRoot, 'sw.js');
  const original = await fs.readFile(filePath, 'utf8');
  let next = bumpServiceWorkerVersion(original);
  next = patchShellAssets(next);

  if (!next.includes('KIOSCO_UPGRADES:FCM')) {
    const patch = await fs.readFile(path.join(packageRoot, 'web-upgrade', 'sw-fcm-patch.js'), 'utf8');
    next = `${next.trimEnd()}\n\n// KIOSCO_UPGRADES:FCM\n${patch.trim()}\n// /KIOSCO_UPGRADES:FCM\n`;
  }

  await writeChanged(filePath, original, next);
}

async function main() {
  const required = ['index.html', 'sw.js', 'js', 'js/cart.js', 'js/admin.js', 'css'];
  for (const item of required) {
    if (!await exists(path.join(targetRoot, item))) {
      throw new Error(`El destino no parece ser mi-kiosco: falta ${item}`);
    }
  }

  console.log(`${dryRun ? '[dry-run] ' : ''}Destino: ${targetRoot}`);

  const pathsToBackup = [
    'index.html',
    'sw.js',
    'js/cart.js',
    'js/admin.js',
    'js/kiosco-upgrade-config.js',
    'js/kiosco-upgrades.js',
    'css/kiosco-upgrades.css',
    'kiosco-api',
    'kiosco-app'
  ];
  for (const relative of pathsToBackup) await backupPath(path.join(targetRoot, relative));
  await ensureDirectory(backupRoot);

  await copyPath(
    path.join(packageRoot, 'web-upgrade', 'js', 'kiosco-upgrade-config.js'),
    path.join(targetRoot, 'js', 'kiosco-upgrade-config.js')
  );
  await copyPath(
    path.join(packageRoot, 'web-upgrade', 'js', 'kiosco-upgrades.js'),
    path.join(targetRoot, 'js', 'kiosco-upgrades.js')
  );
  await copyPath(
    path.join(packageRoot, 'web-upgrade', 'css', 'kiosco-upgrades.css'),
    path.join(targetRoot, 'css', 'kiosco-upgrades.css')
  );
  await copyPath(path.join(packageRoot, 'kiosco-api'), path.join(targetRoot, 'kiosco-api'));
  await copyPath(path.join(packageRoot, 'kiosco-app'), path.join(targetRoot, 'kiosco-app'));
  await copyPath(path.join(packageRoot, 'docs'), path.join(targetRoot, 'docs', 'kiosco-mejoras'));
  await copyPath(path.join(packageRoot, 'README.md'), path.join(targetRoot, 'docs', 'kiosco-mejoras', 'PAQUETE_README.md'));

  await patchIndex();
  await patchCartCheckout();
  await patchCashDateKey();
  await patchServiceWorker();

  console.log('\nAplicación terminada. Siguientes acciones:');
  console.log('1. Editar js/kiosco-upgrade-config.js.');
  console.log('2. Crear config/admin, config/payments y config/billing en Firestore.');
  console.log('3. Revisar docs/kiosco-mejoras/firestore-config-rules.patch.txt.');
  console.log('4. Desplegar kiosco-api en Vercel y probar en un Hosting preview channel.');
}

main().catch(error => {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
});
