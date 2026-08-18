'use strict';

const APP_VERSION = 'kiosco-cache-20260818-firestore-images-fix';
const CACHE_PREFIX = 'kiosco';
const STATIC_CACHE = `${CACHE_PREFIX}-static-${APP_VERSION}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime-${APP_VERSION}`;
const IMAGE_CACHE = `${CACHE_PREFIX}-images-${APP_VERSION}`;

const APP_SHELL = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/css/app.css',
  '/js/config.js',
  '/js/firebase.js',
  '/js/auth.js',
  '/js/store.js',
  '/js/cart.js',
  '/js/orders.js',
  '/js/dashboard.js',
  '/js/admin.js',
  '/js/app.js',
  '/icons/favicon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/css/kiosco-receipts-appearance.css',
  '/js/kiosco-upgrade-config.js',
  '/js/kiosco-receipts-appearance.js',
  '/css/kiosco-final-improvements.css',
  '/js/kiosco-final-improvements.js',
  '/css/kiosco-audit.css',
  '/js/kiosco-audit.js',
  '/css/kiosco-nine-improvements.css',
  '/css/kiosco-responsive-media-v10.css',
  '/js/kiosco-product-experience.js',
  '/js/kiosco-admin-operations.js',
  '/js/kiosco-dashboard-heatmap.js',
  '/css/kiosco-system.css',
  '/js/kiosco-system.js',
  '/js/kiosco-firestore-images.js'
];

const NETWORK_ONLY_HOSTS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'firebasestorage.googleapis.com',
  'storage.googleapis.com'
];

const STATIC_CDN_HOSTS = [
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'www.gstatic.com'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => Promise.allSettled(APP_SHELL.map(asset => cache.add(asset))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter(name => name.startsWith(`${CACHE_PREFIX}-`) && ![STATIC_CACHE, RUNTIME_CACHE, IMAGE_CACHE].includes(name))
        .map(name => caches.delete(name))
    );

    if ('navigationPreload' in self.registration) {
      await self.registration.navigationPreload.enable();
    }

    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CLEAR_APP_CACHE') event.waitUntil(clearAppCaches());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!['http:', 'https:'].includes(url.protocol)) return;

  if (NETWORK_ONLY_HOSTS.includes(url.hostname)) {
    event.respondWith(networkOnly(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(event));
    return;
  }

  if (STATIC_CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
    return;
  }

  if (
    request.destination === 'image'
    || /\.(?:png|jpe?g|jpe|svg|gif|webp|ico|avif|bmp|tiff?|heic|heif|jxl)$/i.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  if (
    request.destination === 'script'
    || request.destination === 'style'
    || /\.(?:js|css|json|webmanifest)$/i.test(url.pathname)
  ) {
    event.respondWith(networkFirst(request, RUNTIME_CACHE, 4500));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
  }
});

async function handleNavigation(event) {
  const request = event.request;
  try {
    const preloadResponse = await event.preloadResponse;
    if (preloadResponse) {
      await putInCache(RUNTIME_CACHE, request, preloadResponse.clone());
      return preloadResponse;
    }
    const response = await fetchWithTimeout(request, 6000);
    await putInCache(RUNTIME_CACHE, request, response.clone());
    return response;
  } catch (error) {
    const cachedPage = await caches.match(request, { ignoreSearch: true });
    if (cachedPage) return cachedPage;
    const appShell = await caches.match('/index.html');
    if (appShell) return appShell;
    const offlinePage = await caches.match('/offline.html');
    if (offlinePage) return offlinePage;
    return new Response('Sin conexión', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch (error) {
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
}

async function networkFirst(request, cacheName, timeoutMs) {
  try {
    const response = await fetchWithTimeout(request, timeoutMs);
    await putInCache(cacheName, request, response.clone());
    return response;
  } catch (error) {
    const cached = await caches.match(request, { ignoreSearch: false });
    if (cached) return cached;
    return new Response('', { status: 504, statusText: 'Gateway Timeout' });
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request, { ignoreSearch: false });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    await putInCache(cacheName, request, response.clone());
    return response;
  } catch (error) {
    return new Response('', { status: 503, statusText: 'Service Unavailable' });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then(async response => {
      if (isCacheable(response)) await cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  if (cached) {
    void networkPromise;
    return cached;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) return networkResponse;
  return new Response('', { status: 503, statusText: 'Service Unavailable' });
}

async function fetchWithTimeout(request, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(request, { cache: 'no-store', signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function putInCache(cacheName, request, response) {
  if (!isCacheable(response)) return;
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
}

function isCacheable(response) {
  return Boolean(response) && (response.ok || response.type === 'opaque');
}

async function clearAppCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter(name => name.startsWith(`${CACHE_PREFIX}-`))
      .map(name => caches.delete(name))
  );
}
