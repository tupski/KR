const CACHE_NAME = 'kr-pwa-v2.2.1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/logo-kr-transparent-square.png',
  '/pwa-icon-192.svg',
  '/pwa-icon-512.svg',
  '/pwa-splash.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  // HAPUS self.skipWaiting() — biarkan SW baru menunggu sampai semua tab ditutup.
  // skipWaiting() bisa menyebabkan halaman reload otomatis saat SW baru activate,
  // yang menghilangkan form state yang belum tersimpan.
  // SW baru akan activate saat user menutup semua tab dan buka ulang.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (!['http:', 'https:'].includes(url.protocol)) return;

  // Jangan cache request ke Supabase/API dinamis agar data dashboard tidak stale di mobile/PWA.
  if (
    url.hostname.includes('supabase.co') ||
    url.pathname.startsWith('/api/')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Exclude version.json from cache
  if (url.pathname.endsWith('version.json')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          return response;
        })
        .catch(() => caches.match('/index.html'));
    }),
  );
});

// Push Notifications
self.addEventListener('push', (event) => {
  try {
    const payload = event.data ? event.data.json() : {};
    const title = payload.title || 'Kakarama Room';
    const body = payload.body || '';
    const url = payload.url || '/';
    const icon = payload.icon || '/pwa-icon-192.svg';
    const badge = payload.badge || '/pwa-icon-192.svg';

    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon,
        badge,
        data: { url, payload },
      }),
    );
  } catch (_e) {
    // ignore malformed payload
  }
});

self.addEventListener('notificationclick', (event) => {
  const url = event?.notification?.data?.url || '/';
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const existing = clientList.find((c) => c.url.includes(self.location.origin));
      if (existing) {
        existing.focus();
        existing.postMessage({ type: 'NAVIGATE', url });
        return;
      }
      return self.clients.openWindow(url);
    }),
  );
});

// Handle messages from frontend
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_PWA_CACHE') {
    console.log('[SW] Menerima perintah CLEAR_PWA_CACHE');
    event.waitUntil(
      caches.keys().then((keys) => {
        return Promise.all(keys.map((key) => caches.delete(key)));
      }).then(() => {
        console.log('[SW] Cache berhasil dikosongkan');
        if (event.source) {
          event.source.postMessage({ type: 'CACHE_CLEARED' });
        }
      })
    );
  }
});
