const CACHE_NAME = 'my-dashboard-v36';
const ASSETS = [
  '/my-dashboard/',
  '/my-dashboard/index.html',
  '/my-dashboard/app.js',
  '/my-dashboard/app.css',
  '/my-dashboard/manifest.json',
  '/my-dashboard/icon-192.png',
  '/my-dashboard/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: wipe ALL old caches completely
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network first, cache as fallback
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
