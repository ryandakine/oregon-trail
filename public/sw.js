const CACHE_NAME = 'oregon-trail-kaplay-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/engine.js',
  '/main.js',
  '/html2canvas.min.js',
  '/manifest.json',
  '/fonts/ibm-plex-mono-400.ttf',
  '/fonts/ibm-plex-mono-700.ttf',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/scenes/loading.js',
  '/scenes/title.js',
  '/scenes/profession.js',
  '/scenes/names.js',
  '/scenes/tone.js',
  '/scenes/store.js',
  '/scenes/travel.js',
  '/scenes/event.js',
  '/scenes/landmark.js',
  '/scenes/river.js',
  '/scenes/death.js',
  '/scenes/hunting.js',
  '/scenes/arrival.js',
  '/scenes/wipe.js',
  '/scenes/newspaper.js',
  '/scenes/share.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Only cache same-origin requests
  if (url.origin !== self.location.origin) return;

  // Never cache API calls
  if (url.pathname.startsWith('/api/')) return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return response;
      });
    }).catch(() => {
      // Offline fallback for navigation
      if (e.request.mode === 'navigate') {
        return caches.match('/index.html');
      }
    })
  );
});
