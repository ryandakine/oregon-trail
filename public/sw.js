const CACHE_NAME = 'oregon-trail-kaplay-v8-hyperfall-polish';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/engine.js',
  '/main.js',
  '/render-mode.mjs',
  '/lib/assets.mjs',
  '/vendor/kaplay.mjs',
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
const OPTIONAL_ASSETS = [
  '/lib/palette.mjs', // draw.mjs re-exports; must load before draw offline
  '/lib/draw.mjs',
  '/lib/hud.mjs',
  '/lib/tone.mjs',
  '/assets/title-hero.png', // WS4 title still; allSettled if missing
  '/assets/art/convoy/wagon_body.svg',
  '/assets/art/convoy/wagon_wheel_rear.svg',
  '/assets/art/convoy/wagon_wheel_front.svg',
  '/assets/art/convoy/ox_sheet.svg',
  '/assets/art/convoy/pioneer_leader_sheet.svg',
  '/assets/art/convoy/pioneer_companion_sheet.svg',
  '/assets/art/scenery/tree_cottonwood.svg',
  '/assets/art/scenery/tree_pine.svg',
  '/assets/art/wildlife/bison.svg',
  '/assets/art/wildlife/deer.svg',
  '/assets/art/wildlife/deer_doe.svg',
  '/assets/art/wildlife/rabbit.svg',
  '/assets/art/landmarks/chimney_rock.svg',
  '/assets/art/landmarks/fort_laramie.svg',
  '/assets/art/landmarks/independence_rock.svg',
  '/assets/art/landmarks/willamette_arrival.svg',
  '/assets/art/river/river_ferry.svg',
  // Three.js bundle (/three/bootstrap.mjs + /vendor/three/*) is intentionally
  // NOT pre-cached here. The fetch handler below lazy-caches any same-origin
  // 200 at runtime, so desktop sessions cache Three on first 3D init and phones
  // that never trigger 3D never pay the ~1.3 MB download cost.
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        await cache.addAll(STATIC_ASSETS);
        // Optional assets may 404 between commit landings; allSettled tolerates it.
        await Promise.allSettled(OPTIONAL_ASSETS.map((a) => cache.add(a)));
      })
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
