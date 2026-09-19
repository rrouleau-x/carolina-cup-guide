/* Carolina Cup — site-wide service worker.
   Scope: /carolina-cup-guide/ (repo root), so Game Day, the hub and the PDF
   all work with no signal. The app under /app/ keeps its own narrower worker,
   which takes precedence for those URLs.

   Strategy: network-first (always prefer fresh), fall back to cache offline. */

const CACHE = 'carolina-cup-shell-v8';

const PRECACHE = [
  './',
  'index.html',
  'game-day.html',
  'app/',
  'app/index.html',
  'app/data.json',
  'app/manifest.json',
  'app/teams/u9-premier.json',
  'app/teams/u9-blue.json',
  'app/teams/u10-premier.json',
  'app/teams/u10-blue.json',
  'carolina-cup.ics',
  'qr-guide.png',
  'qr-app.png'
];
// NOTE: guide.pdf (644 KB) is deliberately NOT precached. It is ~9x the size of
// the whole app, and eager-caching it means every first visit pays 744 KB even
// if nobody opens the PDF. The fetch handler below still caches it on first
// view, so it works offline once opened — and the QR code saves it directly.

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(PRECACHE.map(u => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      // Only clean our own family — never touch the app's cache under /app/.
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('carolina-cup-shell-') && k !== CACHE)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // Only handle same-origin; let fonts / weather API go straight to network.
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(req, { cache: 'no-store' })
      .then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        if (req.mode === 'navigate') {
          const fb = (await caches.match('game-day.html')) || (await caches.match('index.html'));
          if (fb) return fb;
        }
        return new Response('Offline — this page has not been cached yet.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      })
  );
});
