const CACHE = 'kiosco-v12';
const SHELL = ['/', '/index.html', '/offline.html', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => { })));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname.includes('firebase') || url.hostname.includes('googleapis') || url.hostname.includes('gstatic')) {
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })));
    return;
  }
  if (url.pathname.match(/\.(js|css|json)$/) || url.pathname.endsWith('config.js')) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }).then(r => {
        if (r && r.status === 200) { const c = r.clone(); caches.open(CACHE).then(ch => ch.put(e.request, c)); }
        return r;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  if (url.pathname.match(/\.(png|jpg|jpeg|svg|ico|webp|gif)$/)) {
    e.respondWith(caches.match(e.request).then(c => {
      if (c) return c;
      return fetch(e.request).then(r => { if (r && r.status === 200) { const cl = r.clone(); caches.open(CACHE).then(ch => ch.put(e.request, cl)); } return r; });
    }));
    return;
  }
  e.respondWith(
    fetch(e.request).then(r => { if (r && r.status === 200) { const c = r.clone(); caches.open(CACHE).then(ch => ch.put(e.request, c)); } return r; })
      .catch(() => caches.match(e.request).then(c => c || caches.match('/offline.html')))
  );
});
