// Minimal offline support for the staff reservations calendar.
// Caches GET responses for calendar/reservation reads so the dashboard can
// render a read-only, possibly-stale view when offline. Does not intercept
// or queue writes (POST/PATCH/DELETE) — those simply fail offline, same as
// before this file existed.

const CACHE_NAME = 'lake-pass-calendar-v1';
const CACHEABLE_PATH_FRAGMENTS = ['/reservations', '/boats/mine', '/calendar'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isCacheable = CACHEABLE_PATH_FRAGMENTS.some((fragment) =>
    url.pathname.includes(fragment)
  );
  if (!isCacheable) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => {
          if (cached) return cached;
          return new Response(
            JSON.stringify({ error: 'Offline and no cached data available' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        })
      )
  );
});
