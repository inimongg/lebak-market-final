/* Lebak.market — Service Worker
 * Tujuan: bikin app bisa di-install (installable PWA) dan tetap kebuka
 * meski sinyal jelek/putus, TANPA membuat data (produk/chat/order) basi.
 *
 * Strategi:
 * - Assets statis (ikon, manifest, font) -> cache-first (jarang berubah)
 * - Halaman (navigasi) & API (/api/...) -> network-first, fallback ke
 *   cache/offline page kalau benar-benar tanpa koneksi. Data selalu
 *   diutamakan dari server saat online supaya tidak pernah basi.
 * - Foto produk (/uploads/...) -> stale-while-revalidate (tampil cepat
 *   dari cache, diperbarui di background).
 */
const CACHE_VERSION = 'lebak-market-v1';
const SHELL_CACHE = CACHE_VERSION + '-shell';
const IMG_CACHE = CACHE_VERSION + '-img';
const SHELL_ASSETS = ['/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // POST (order, chat, dll.) selalu langsung ke server
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // biarkan CDN font dll. apa adanya

  // Foto produk: stale-while-revalidate
  if (url.pathname.startsWith('/uploads/')) {
    event.respondWith(
      caches.open(IMG_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const fetchPromise = fetch(request).then((res) => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Assets shell: cache-first
  if (SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
    return;
  }

  // Halaman & API: network-first, fallback cache kalau offline (data tetap fresh saat online)
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok && (url.pathname === '/' || url.pathname.endsWith('.html'))) {
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, res.clone()));
        }
        return res;
      })
      .catch(() =>
        caches.match(request).then((cached) => cached || caches.match('/'))
      )
  );
});
