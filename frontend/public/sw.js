const CACHE_NAME = 'serverctrl-v6';
const STATIC_ASSETS = ['/', '/index.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Only same-origin GETs; never API calls, the terminal socket or other sites.
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/')) return;
  // Network first; offline navigations fall back to the cached app shell.
  e.respondWith(
    fetch(e.request).catch(() =>
      caches.match(e.request).then((r) => r || (e.request.mode === 'navigate' ? caches.match('/') : Response.error())))
  );
});

// ── Push notifications ──────────────────────────────────────
self.addEventListener('push', (e) => {
  if (!e.data) return;
  let data;
  try { data = e.data.json(); } catch { return; }

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/skull.svg',
      badge: data.badge || '/skull.svg',
      tag: data.tag || 'serverctrl',
      renotify: true,
      vibrate: [200, 100, 200],
      data: { url: '/' },
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});