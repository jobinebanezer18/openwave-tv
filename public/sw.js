const CACHE_NAME = 'openwave-web-shell-v8';
const APP_SHELL = ['/', '/favicon.svg', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/catalog/world/index.v1.json', '/catalog/world/IN.v1.json', '/catalog/world/sports.v1.json', '/radio/stations.v1.json'];

async function precacheAppShell(cache) {
  await cache.addAll(APP_SHELL);
  const response = await cache.match('/');
  if (!response) throw new Error('App shell was not cached');
  await cache.put('/index.html', response.clone());
  const html = await response.text();
  const entryAssets = [...html.matchAll(/(?:src|href)=["'](\.\/assets\/[^"']+\.(?:js|css))(?:\?[^"']*)?["']/g)]
    .map(match => new URL(match[1], self.location.origin).href)
    .filter(asset => new URL(asset).origin === self.location.origin);
  if (entryAssets.length) await cache.addAll(entryAssets);
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(precacheAppShell).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('openwave-web-shell-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.destination === 'video' || request.destination === 'audio') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (url.pathname.endsWith('.m3u8') || url.pathname.endsWith('.ts') || url.pathname.endsWith('.m4s')) return;
  if (/^\/catalog\/world\/(?:index|sports|[A-Z]{2})\.v1\.json$/.test(url.pathname)) {
    event.respondWith(caches.open(CACHE_NAME).then(async cache => {
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        return (await cache.match(request)) || Response.error();
      }
    }));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const appHome = url.pathname === '/' || url.pathname === '/index.html';
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(appHome ? '/index.html' : request, response.clone());
        return response;
      } catch {
        return (await cache.match(appHome ? '/index.html' : request)) || Response.error();
      }
    })());
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        return Response.error();
      }
    })());
    return;
  }
  if (APP_SHELL.includes(url.pathname)) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
  }
});
