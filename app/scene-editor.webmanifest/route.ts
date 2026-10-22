import { resolveBrand } from '@/lib/brand';

// Web app manifest of the scene editor: installs /admin/scenes as its own app.
// A route (not app/manifest.ts) so it covers only the editor and is named after the brand;
// outside /admin so browsers can fetch it without the login cookie.
export function GET(request: Request) {
  const brand = resolveBrand(request.headers.get('x-forwarded-host') ?? request.headers.get('host'), { devOverride: process.env.DEV_BRAND });
  const name = brand === 'magicforms' ? 'Magic Forms Scenes' : 'Claypixels Scenes';
  const manifest = {
    id: '/admin/scenes',
    name: `${name} editor`,
    short_name: name,
    description: 'Build 2.5D and 3D scenes: pictures and layers, models, lights, camera and stories.',
    start_url: '/admin/scenes',
    scope: '/admin/scenes',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone'],
    orientation: 'any',
    background_color: '#141a24',
    theme_color: '#141a24',
    categories: ['graphics', 'productivity'],
    icons: [
      { src: '/icons/scene-editor-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/scene-editor-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/scene-editor-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };
  return new Response(JSON.stringify(manifest), {
    headers: { 'content-type': 'application/manifest+json', 'cache-control': 'public, max-age=3600' }
  });
}
