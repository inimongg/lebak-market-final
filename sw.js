/* Service Worker Lebak-Market — bikin notifikasi (chat, status pesanan,
 * ulasan, like, misi) tetap masuk walau browser/tab sudah ditutup.
 * Ini terpisah dari SSE (/api/events) yang cuma hidup selagi tab terbuka —
 * push ini jalan lewat browser push service, bukan koneksi ke app-nya. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch { data = { title: 'Lebak-Market', body: event.data ? event.data.text() : '' }; }

  const title = data.title || 'Lebak-Market';
  const options = {
    body: data.body || '',
    tag: data.tag || undefined,       // notif dgn tag sama saling menimpa (mis. chat dari orang yg sama)
    renotify: !!data.tag,
    data: { url: data.url || '/' },
    vibrate: [80, 40, 80],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

/* Klik notifikasi → fokus tab yang sudah terbuka, atau buka tab baru */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const existing = list.find((c) => c.url.includes(self.location.origin));
      if (existing) { existing.focus(); return; }
      return self.clients.openWindow(url);
    })
  );
});
