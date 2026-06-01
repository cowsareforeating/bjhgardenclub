import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'BJH Garden Club',
        short_name: 'BJH Garden',
        description: 'Track tree beds and care sessions in the field',
        theme_color: '#383838',
        background_color: '#383838',
        display: 'standalone',
        start_url: '/',
        icons: [
          // SVG works in dev and on most install prompts.
          // Drop PNGs into /public/ named exactly like below and they'll be picked up.
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // Cache basemap tiles so the map keeps showing while offline.
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.hostname.endsWith('basemaps.cartocdn.com') ||
              url.hostname.endsWith('tiles.stadiamaps.com'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          }
        ]
      }
    })
  ],
  server: { host: true }
});
