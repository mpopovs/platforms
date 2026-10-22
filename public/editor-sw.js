// Service worker for the scene editor app (PWA), scope /admin/scenes.
// Separate from /sw.js (TV / kiosk viewer); a page is controlled by the
// worker with the most specific scope, so the two never meet.
//
//   pages (navigations)       network first; the last copy when offline; else an offline page
//   /_next/static/*           cache first (file names change with every build)
//   onnxruntime files (CDN)   cache first (pinned version)
//   scene files API (GET)     network first, last copy when offline (look at a scene offline)
//   AI models                 not here: the editor keeps them itself (Cache API, claypixels-models-v1)
//   everything else           straight to the network (saving always needs a connection)

const VERSION = 'editor-v1';
const PAGES = `${VERSION}-pages`, STATIC = `${VERSION}-static`, FILES = `${VERSION}-files`;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('editor-') && !k.startsWith(VERSION)) await caches.delete(k);
    await self.clients.claim();
  })());
});

const OFFLINE = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline</title><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#141a24;color:#e8eef5;font:15px/1.5 system-ui,sans-serif">
<div style="max-width:360px;padding:24px;text-align:center"><h1 style="font-size:20px">You are offline</h1>
<p>The scene editor needs a connection to open this page and to save. Reconnect, then try again.</p>
<button onclick="location.reload()" style="padding:8px 16px;border-radius:8px;border:0;background:#3d6b96;color:#fff;font:inherit">Try again</button></div></body></html>`;

async function networkFirst(req, cacheName, fallback) {
  try {
    const res = await fetch(req);
    if (res.ok && res.type !== 'opaqueredirect') (await caches.open(cacheName)).put(req, res.clone());
    return res;
  } catch {
    const hit = await caches.match(req);
    if (hit) return hit;
    if (fallback) return fallback();
    throw new Error('offline');
  }
}
async function cacheFirst(req, cacheName) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') (await caches.open(cacheName)).put(req, res.clone());
  return res;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, PAGES, () => new Response(OFFLINE, { headers: { 'content-type': 'text/html; charset=utf-8' } })));
    return;
  }
  if (url.origin === location.origin && url.pathname.startsWith('/_next/static/')) { event.respondWith(cacheFirst(req, STATIC)); return; }
  if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('/onnxruntime-web@')) { event.respondWith(cacheFirst(req, STATIC)); return; }
  if (url.origin === location.origin && url.pathname.startsWith('/icons/')) { event.respondWith(cacheFirst(req, STATIC)); return; }
  if (url.origin === location.origin && /^\/api\/scenes\/[^/]+\/files\//.test(url.pathname)) { event.respondWith(networkFirst(req, FILES)); return; }
});
