# Next.js Multi-Tenant Example

A production-ready example of a multi-tenant application built with Next.js 15, featuring custom subdomains for each tenant.

## Features

- ✅ Custom subdomain routing with Next.js middleware
- ✅ Tenant-specific content and pages
- ✅ Shared components and layouts across tenants
- ✅ Redis for tenant data storage
- ✅ Admin interface for managing tenants
- ✅ Emoji support for tenant branding
- ✅ Support for local development with subdomains
- ✅ Compatible with Vercel preview deployments

## Tech Stack

- [Next.js 15](https://nextjs.org/) with App Router
- [React 19](https://react.dev/)
- [Upstash Redis](https://upstash.com/) for data storage
- [Tailwind 4](https://tailwindcss.com/) for styling
- [shadcn/ui](https://ui.shadcn.com/) for the design system

## Getting Started

### Prerequisites

- Node.js 18.17.0 or later
- pnpm (recommended) or npm/yarn
- Upstash Redis account (for production)

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/vercel/platforms.git
   cd platforms
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Set up environment variables:
   Create a `.env.local` file in the root directory with:

   ```
   KV_REST_API_URL=your_redis_url
   KV_REST_API_TOKEN=your_redis_token
   ```

4. Start the development server:

   ```bash
   pnpm dev
   ```

5. Access the application:
   - Main site: http://localhost:3000
   - Admin panel: http://localhost:3000/admin
   - Tenants: http://[tenant-name].localhost:3000

## Multi-Tenant Architecture

This application demonstrates a subdomain-based multi-tenant architecture where:

- Each tenant gets their own subdomain (`tenant.yourdomain.com`)
- The middleware handles routing requests to the correct tenant
- Tenant data is stored in Redis using a `subdomain:{name}` key pattern
- The main domain hosts the landing page and admin interface
- Subdomains are dynamically mapped to tenant-specific content

The middleware (`middleware.ts`) intelligently detects subdomains across various environments (local development, production, and Vercel preview deployments).

## Deployment

This application is designed to be deployed on Vercel. To deploy:

1. Push your repository to GitHub
2. Connect your repository to Vercel
3. Configure environment variables
4. Deploy

For custom domains, make sure to:

1. Add your root domain to Vercel
2. Set up a wildcard DNS record (`*.yourdomain.com`) on Vercel

## Viewer: offline-first mode & daytime refresh control (Smart TV / kiosk)

The `/viewer/[viewerId]` page runs continuously on Samsung Smart TVs (Tizen
browser / fullscreen web app) showing 3D models and textures. It's designed
to never visibly interrupt what's on screen and to keep working with no
network connection.

**Config:** all tunables live in [`lib/viewer-runtime-config.ts`](lib/viewer-runtime-config.ts).

- **Daytime no-reload window** (`DAYTIME_START_HOUR` / `DAYTIME_END_HOUR`,
  default `08:00–22:00` local device time): while inside this window the page
  will never perform a full reload. Data updates still happen, just silently
  (see below). Outside the window (night) a full reload is allowed, so the
  display starts each day fully up to date and with a clean memory/GPU state.
  The one exception is WebGL context-loss recovery
  ([viewer-display.tsx](<app/viewer/[viewerId]/viewer-display.tsx>)) — if the
  canvas already crashed there's nothing left to "not interrupt", so that
  recovery reload always runs regardless of time of day.
- **Background refresh, not visible reload**: model/texture data is polled
  every `MODEL_POLL_INTERVAL_MS` / `TEXTURE_POLL_INTERVAL_MS` (default 30s)
  via plain `fetch` calls that swap the new data into React state — no
  `location.reload()` involved, so the 3D canvas never flashes or unmounts.
  The Service Worker additionally keeps 3D model/texture blobs and the app
  shell (HTML/JS/CSS) fresh in the cache using stale-while-revalidate, so the
  *next* load (including a night-time full reload) is instant even if the
  network is flaky.
- **Offline caching strategy**: two layers, so it degrades gracefully even if
  one is unavailable:
  1. **IndexedDB** ([`lib/texture-cache.ts`](lib/texture-cache.ts)) stores the
     actual model (`.glb`/`.gltf`/`.obj`) and texture blobs. This is what
     [`components/model-3d.tsx`](components/model-3d.tsx) reads from first,
     completely independent of the Service Worker/fetch interception — this
     is the primary offline path and it also works on TVs/browsers with no
     (or partial) Service Worker support.
  2. **Service Worker** ([`public/sw.js`](public/sw.js)) cache-first with
     background revalidation for Supabase storage (textures/models) and for
     the same-origin app shell (HTML navigation + `/_next/static/*` JS/CSS),
     so the page itself can boot with zero connectivity. API routes
     (`/api/*`) are always left to the network since they carry live data.
- **Tizen compatibility note**: Samsung Smart TVs from ~2018 onward (Tizen
  4.0+) support Service Workers and the Cache API. Older Tizen builds may not.
  Because the IndexedDB cache in `lib/texture-cache.ts` doesn't depend on the
  Service Worker at all, models/textures still load offline even on TVs where
  `'serviceWorker' in navigator` is `false` — registration is wrapped in a
  feature check and a try/catch ([`components/service-worker-registration.tsx`](components/service-worker-registration.tsx))
  so a lack of SW support (or a failed registration) never breaks the viewer.
- **Offline detection**: `navigator.onLine` is unreliable on Tizen (it mostly
  reflects the network interface, not real reachability), so
  [`lib/connectivity-monitor.ts`](lib/connectivity-monitor.ts) backs it with a
  real same-origin probe (`CONNECTIVITY_PROBE_URL`, `CONNECTIVITY_PROBE_INTERVAL_MS`).
  While offline, all background polling (models, textures, prefetching) is
  fully paused — no failed-request spam, no retry loops — and resumes
  automatically the moment connectivity returns.
- **Graceful degradation**: every network/cache operation (SW registration,
  model/texture fetches, connectivity probing) is wrapped so a failure just
  falls back to showing whatever is already on screen/cached, instead of
  breaking the viewer.

