// Service worker Uji Jelajah: kerangka aplikasi tetap terbuka saat offline.
// Prinsip privasi: respons /api/ TIDAK pernah disimpan di cache, supaya data peserta tidak tertinggal di perangkat bersama.
const CACHE = 'uj-shell-v3';
const SHELL = [
  '/', '/css/app.css', '/manifest.webmanifest',
  '/js/app.js', '/js/dom.js', '/js/api.js', '/js/ui.js', '/js/format.js',
  '/js/views/auth.js', '/js/views/legal.js', '/js/views/panduan.js', '/js/views/peserta.js', '/js/views/siklus.js', '/js/views/fasilitator.js', '/js/views/koordinator.js',
  '/fonts/ibm-plex-sans-latin.woff2', '/fonts/newsreader-latin.woff2',
  '/img/logo-32.png', '/img/logo-64.png', '/img/logo-192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/')) return; // data dan video: selalu dari jaringan
  // Jaringan dulu supaya versi baru langsung terpakai; cache hanya cadangan saat offline.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('/'))),
  );
});
