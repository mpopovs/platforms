// Service Worker for offline-first caching on the Smart TV / kiosk viewer.
//
// Strategy summary (see README.md for the full explanation):
//   - Supabase storage (textures/models): cache-first, stale-while-revalidate.
//   - Same-origin navigation + static build assets (HTML/JS/CSS/fonts):
//     cache-first, stale-while-revalidate. This is what lets the viewer boot
//     with zero network connectivity.
//   - API routes (/api/*): never intercepted, always network — these carry
//     live data and are polled/gated separately by the app (see
//     lib/connectivity-monitor.ts and lib/viewer-runtime-config.ts).
//   - Everything else (cross-origin misc): network-first, cache fallback.
//
// NOTE ON TIZEN SUPPORT: Samsung Smart TVs from ~2018 onward (Tizen 4.0+)
// support Service Workers and the Cache API. Older Tizen builds (2.x/3.x,
// pre-2018 sets) may have partial or no Service Worker support. As a
// fallback for those devices — and as the primary cache for the actual 3D
// model/texture *blobs* on all devices — the app also stores models and
// textures directly in IndexedDB (see lib/texture-cache.ts), which does not
// depend on Service Worker/fetch interception at all. If `serviceWorker` is
// unsupported or registration fails, the app keeps working using that
// IndexedDB cache alone (see components/service-worker-registration.tsx and
// components/model-3d.tsx).
const CACHE_NAME = 'viewer-cache-v1';
const TEXTURE_CACHE = 'texture-cache-v1';
const MODEL_CACHE = 'model-cache-v1';

// URLs to cache on install (only cache if they exist)
const STATIC_ASSETS = [
  // Don't pre-cache static assets to avoid errors
  // Assets will be cached on-demand during fetch
];

// Install event - skip pre-caching to avoid errors
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker');
  event.waitUntil(
    Promise.resolve().then(() => {
      console.log('[SW] Service worker installed (caching on-demand only)');
      return self.skipWaiting();
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && 
              cacheName !== TEXTURE_CACHE && 
              cacheName !== MODEL_CACHE) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

function isStaticBuildAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname === '/sw.js' ||
    url.pathname === '/manifest.json' ||
    /\.(js|css|woff2?|ttf|ico|png|jpg|jpeg|svg|webp)$/i.test(url.pathname)
  );
}

// Fetch event - cache-first strategy for textures, models, and the app shell
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Don't intercept API routes - let them go directly to the network
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Cache strategy for Supabase Storage URLs (textures and models)
  if (url.hostname.includes('supabase') && 
      (url.pathname.includes('/storage/v1/object/') || url.pathname.includes('/object/public/'))) {
    
    // Determine cache based on path
    let cacheName = TEXTURE_CACHE;
    if (url.pathname.includes('/3d-models/') || url.pathname.includes('.glb') || url.pathname.includes('.gltf')) {
      cacheName = MODEL_CACHE;
    }

    event.respondWith(
      caches.open(cacheName).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            console.log('[SW] Serving from cache:', url.pathname);
            
            // Return cached response immediately, but also fetch in background to update cache
            event.waitUntil(
              fetch(event.request).then((freshResponse) => {
                if (freshResponse.ok) {
                  cache.put(event.request, freshResponse.clone());
                }
              }).catch(() => {
                // Ignore fetch errors in background update
              })
            );
            
            return cachedResponse;
          }

          // Not in cache, fetch from network
          console.log('[SW] Fetching from network:', url.pathname);
          return fetch(event.request).then((response) => {
            // Cache successful responses
            if (response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch((error) => {
            console.error('[SW] Fetch failed:', error);
            throw error;
          });
        });
      })
    );
    return;
  }

  // Same-origin navigation (the HTML page itself) and static build assets
  // (JS/CSS/fonts/icons): cache-first with background revalidation. This is
  // what allows the viewer to boot instantly with no network connection at
  // all, showing the last successfully loaded page/shell.
  if (url.origin === self.location.origin && (event.request.mode === 'navigate' || isStaticBuildAsset(url))) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cachedResponse) => {
          const networkFetch = fetch(event.request)
            .then((freshResponse) => {
              if (freshResponse && freshResponse.ok) {
                cache.put(event.request, freshResponse.clone());
              }
              return freshResponse;
            })
            .catch(() => null); // Offline — ignore, we already have (or lack) a cached copy

          if (cachedResponse) {
            event.waitUntil(networkFetch);
            return cachedResponse;
          }

          return networkFetch.then((response) => response || cachedResponse || Response.error());
        })
      )
    );
    return;
  }

  // Network-first for everything else (cross-origin misc requests)
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});


// Message handler for cache management
self.addEventListener('message', (event) => {
  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            console.log('[SW] Clearing cache:', cacheName);
            return caches.delete(cacheName);
          })
        );
      }).then(() => {
        event.ports[0].postMessage({ success: true });
      })
    );
  }
  
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
