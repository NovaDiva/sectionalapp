// Sectional Practice (phone): keeps the app working offline. Bump VERSION whenever any file
// listed here changes, including the shared iPad files in ../ (they are used by both apps).
// Its own scope (/phone/) and cache names, so updating the iPad app never forces an update here.
const VERSION = 'practice-v1';
const FILES = [
  './',
  './index.html',
  './css/phone.css',
  './js/app.js',
  './js/db.js',
  './js/player.js',
  './js/timestamps.js',
  './js/pitch.js',
  './manifest.webmanifest',
  '../css/app.css',
  '../js/timestamps.js',
  '../js/pitch.js',
  '../js/parts.js',
  '../js/commands.js',
  '../js/scoretimes.js',
  '../vendor/pdfjs/pdf.min.mjs',
  '../vendor/pdfjs/pdf.worker.min.mjs',
  '../icons/icon-192.png',
  '../icons/icon-512.png',
  '../icons/apple-touch-icon.png',
  '../icons/hummingsong-logo.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      // Only this app's old caches: the iPad app's caches ('sectional-…') are left alone.
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('practice-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network first (so updates arrive), falling back to the saved copy when offline.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.endsWith('/sw.js')) return; // version checks always go to the network
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))),
  );
});
