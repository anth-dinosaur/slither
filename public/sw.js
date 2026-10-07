// Offline support: precache the whole app, serve cache-first.
// The server stamps BUILD with a content hash, so any file change yields a new
// worker that re-caches everything atomically and drops the old cache.
const BUILD = '__BUILD_VERSION__';
const CACHE = `slither-cc-${BUILD}`;
const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'icon-180.png',
  'icon-192.png',
  'icon-512.png',
  'src/main.js',
  'src/game.js',
  'src/render.js',
  'src/icons.js',
  'src/audio.js',
  'src/settings.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(ASSETS.map((a) => new Request(a, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('slither-cc-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (req.mode === 'navigate') return (await cache.match('index.html')) || fetch(req);
      return (await cache.match(req, { ignoreSearch: true })) || fetch(req);
    })(),
  );
});
