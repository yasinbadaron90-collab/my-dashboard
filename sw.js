const CACHE_NAME = 'my-dashboard-v39';
const ASSETS = [
  '/my-dashboard/',
  '/my-dashboard/index.html',
  '/my-dashboard/app.css',
  '/my-dashboard/core.js',
  '/my-dashboard/money.js',
  '/my-dashboard/odin.js',
  '/my-dashboard/savings.js',
  '/my-dashboard/carpool.js',
  '/my-dashboard/cashflow.js',
  '/my-dashboard/settings.js',
  '/my-dashboard/borrow.js',
  '/my-dashboard/sync.js',
  '/my-dashboard/prayer.js',
  '/my-dashboard/maint.js',
  '/my-dashboard/odin_chat.js',
  '/my-dashboard/cars.js',
  '/my-dashboard/school.js',
  '/my-dashboard/instalments.js',
  '/my-dashboard/routine.js',
  '/my-dashboard/manifest.json',
  '/my-dashboard/icon-192.png',
  '/my-dashboard/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
