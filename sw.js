// ════════════════════════════════════════════════════════════════════
// SERVICE WORKER — My Dashboard PWA
// ════════════════════════════════════════════════════════════════════
//
// Strategy: STALE-WHILE-REVALIDATE for the app shell, CACHE-FIRST for
// CDN resources, NETWORK-ONLY for everything else.
//
// • Stale-while-revalidate (app shell): serves cached version instantly
//   on every load — including offline. In the background, fetches fresh
//   version and updates the cache for next time. App opens INSTANTLY
//   even on slow connections, and works fully offline.
// • Cache-first (CDN): external libs (Chart.js etc.) rarely change. We
//   keep them in a separate cache so they survive app version bumps.
// • Network-only (rest): API calls and unknown URLs go straight to the
//   network. Don't cache things we don't recognise.
//
// To force every client to upgrade: bump CACHE_VERSION below.
// ════════════════════════════════════════════════════════════════════

const CACHE_VERSION = 'v47';
const SHELL_CACHE   = 'my-dashboard-shell-' + CACHE_VERSION;
const CDN_CACHE     = 'my-dashboard-cdn-'   + CACHE_VERSION;

// App shell — the files needed for the app to load and run.
// These are precached on install so the app works fully offline.
// IMPORTANT: only list files that ACTUALLY EXIST in the deployment.
// addAll is atomic — if any file 404s, the whole install fails silently
// and the user gets no offline support. This was the bug in the old SW.
const SHELL_ASSETS = [
  '/my-dashboard/',
  '/my-dashboard/index.html',
  '/my-dashboard/core.js',
  '/my-dashboard/db.js',
  '/my-dashboard/passengers.js',
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
  '/my-dashboard/supabase-client.js',
  '/my-dashboard/cloud-sync.js',
  '/my-dashboard/manifest.json'
];

// Optional assets — files we'd LIKE to cache but won't fail install
// if they're missing (icons, etc.). These are added best-effort.
const OPTIONAL_ASSETS = [
  '/my-dashboard/icon-192.png',
  '/my-dashboard/icon-512.png'
];

// ── INSTALL: precache the app shell ────────────────────────────────
// Use individual fetches so a single 404 doesn't kill the whole install.
// This is the key bug fix vs the old SW which used cache.addAll() and
// got blocked silently when app.css (which doesn't exist) failed.
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // Required assets — log but don't fail on individual misses
    await Promise.all(SHELL_ASSETS.map(async url => {
      try {
        const res = await fetch(url, { cache: 'reload' });
        if(res.ok) await cache.put(url, res);
        else console.warn('[sw] shell asset returned', res.status, url);
      } catch(e){
        console.warn('[sw] shell asset failed to fetch:', url, e);
      }
    }));
    // Optional assets — totally best-effort
    await Promise.all(OPTIONAL_ASSETS.map(async url => {
      try {
        const res = await fetch(url, { cache: 'reload' });
        if(res.ok) await cache.put(url, res);
      } catch(e){ /* silent */ }
    }));
    // Activate immediately so the new SW takes over without a second reload
    self.skipWaiting();
  })());
});

// ── ACTIVATE: clean up old caches ──────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Keep only the current versioned caches; nuke everything else.
    await Promise.all(keys.map(k => {
      if(k !== SHELL_CACHE && k !== CDN_CACHE) return caches.delete(k);
    }));
    await self.clients.claim();
  })());
});

// ── FETCH: route requests by destination ──────────────────────────
self.addEventListener('fetch', event => {
  const req = event.request;
  // Only handle GET — POST/PUT/DELETE shouldn't be cached
  if(req.method !== 'GET') return;

  const url = new URL(req.url);

  // Route 1: same-origin app shell → stale-while-revalidate
  // Serves cache instantly, updates in background. Best UX for app shell.
  if(url.origin === self.location.origin){
    event.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
    return;
  }

  // Route 2: known CDNs (Chart.js, etc.) → cache-first
  // External libs rarely change. Cache once, use forever.
  if(/cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|unpkg\.com|jsdelivr\.net/.test(url.hostname)){
    event.respondWith(cacheFirst(req, CDN_CACHE));
    return;
  }

  // Route 3: everything else — let the browser handle it normally.
  // Don't intercept API calls or unknown third-party requests.
});

// ── Stale-while-revalidate ─────────────────────────────────────────
// Returns cached response immediately if available. In the background,
// fetches a fresh copy and updates the cache for next time. If there's
// no cache hit AND no network, returns a synthetic offline response.
async function staleWhileRevalidate(request, cacheName){
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  // Kick off the background fetch — don't await it, so user gets cached
  // response instantly. Update cache when fetch completes.
  const fetchPromise = fetch(request).then(response => {
    if(response && response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  // If cached, return it now. If not, wait for the network.
  if(cached) return cached;
  const networkResponse = await fetchPromise;
  if(networkResponse) return networkResponse;
  // Fully offline + nothing cached → synthetic offline page
  return new Response(
    '<h1 style="font-family:sans-serif;color:#888;text-align:center;padding:40px;">Offline — please reconnect to load the dashboard for the first time.</h1>',
    { status: 503, headers: { 'Content-Type': 'text/html' } }
  );
}

// ── Cache-first ────────────────────────────────────────────────────
// For CDN libs that rarely change. Try cache, fall back to network and
// cache for next time. Avoids re-downloading Chart.js on every visit.
async function cacheFirst(request, cacheName){
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if(cached) return cached;
  try {
    const networkResponse = await fetch(request);
    if(networkResponse && networkResponse.ok){
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch(e){
    // Offline + not cached — let the browser show its own error
    return new Response('', { status: 503 });
  }
}

// ── Message channel — for "update available" notifications ────────
// The page can postMessage({type:'SKIP_WAITING'}) to force the new SW
// to activate immediately when an update is available. Currently unused
// but ready for an "Update available" toast in core.js if desired.
self.addEventListener('message', event => {
  if(event.data && event.data.type === 'SKIP_WAITING'){
    self.skipWaiting();
  }
});
