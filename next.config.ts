import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['puppeteer'],
  transpilePackages: ['@claypixels/scene-engine'],
  // scene editor app (PWA): its service worker lives at the root but controls only /admin/scenes
  async headers() {
    return [{
      source: '/editor-sw.js',
      headers: [
        { key: 'Service-Worker-Allowed', value: '/admin/scenes' },
        { key: 'Cache-Control', value: 'no-cache' }
      ]
    }];
  },
  compiler: {
    removeConsole: false,
  },
  experimental: {
    // Enable experimental features if needed
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // Ensure proper handling of Vercel Analytics and Speed Insights
  // headers: async () => {
  //   return [
  //     {
  //       source: '/_vercel/speed-insights/script.js',
  //       headers: [
  //         {
  //           key: 'Cache-Control',
  //           value: 'public, max-age=31536000, immutable',
  //         },
  //       ],
  //     },
  //   ];
  // },
};

export default nextConfig;
