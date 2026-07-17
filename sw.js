const CACHE_NAME = 'sarmart-cache';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    (async () => {
      try {
        // Always try the network first.
        const response = await fetch(event.request);

        // Save a copy for offline use.
        if (event.request.url.startsWith(self.location.origin)) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, response.clone());
        }

        return response;
      } catch (err) {
        // If offline, use the cached copy.
        const cached = await caches.match(event.request);
        return cached || Response.error();
      }
    })()
  );
});
