// Service Worker for offline texture caching
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

// Fetch event - cache-first strategy for textures and models
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Only handle GET requests
  if (event.request.method !== 'GET') {
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

  // Network-first for all other requests
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
