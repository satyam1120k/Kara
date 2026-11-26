/**
 * KĀRA: Service Worker
 * Makes the game installable and fully playable offline.
 *
 * Strategy: network-first with cache fallback.
 *  - Online: you always get the latest files (and the cache is refreshed).
 *  - Offline: everything is served from the cache.
 *
 * Bump CACHE_VERSION when you add or rename files in PRECACHE_URLS.
 */

const CACHE_VERSION = 'kara-202611241824-pxgs';

const PRECACHE_URLS = [
  './',
  './index.html',
  './styles.css',
  './online.css',
  './pieces.css',
  './manifest.json',
  './js/app.js',
  './js/ui.js',
  './js/engine.js',
  './js/rules.js',
  './js/ai.js',
  './js/ai-client.js',
  './js/ai-worker.js',
  './js/audio.js',
  './js/compendium.js',
  './js/storage.js',
  './js/api.js',
  './js/account.js',
  './js/online.js',
  './js/ratings.js',
  './js/updates.js',
  './js/piece-art.js',
  './fonts/fonts.css',
  './fonts/cinzel-latin.woff2',
  './fonts/cinzel-latin-ext.woff2',
  './fonts/inter-latin.woff2',
  './fonts/inter-latin-ext.woff2',
  './fonts/fira-code-latin.woff2',
  './fonts/fira-code-latin-ext.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never cache live data: accounts, games, avatars, the APK download.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/') ||
      url.pathname.startsWith('/downloads/') || url.pathname === '/version.json') return;

  event.respondWith(
    fetch(req)
      .then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(req, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(req, { ignoreSearch: true });
        if (cached) return cached;
        // Offline navigation to any page: fall back to the app shell.
        if (req.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      })
  );
});
