import { readdirSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Every card picture, so the app can save them all for offline use (src/lib/offline.ts).
const pictures = readdirSync('public/cards').filter((f) => f.endsWith('.png'))

// https://vite.dev/config/
export default defineConfig({
  define: { __SUYLO_PICTURES__: JSON.stringify(pictures) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'card-placeholder.svg'],
      workbox: {
        // Only the app itself (code, fonts, icons — about 2 MB) is saved in this one all-or-nothing step, so on a
        // phone connection it is ready to open offline within seconds. The pictures and voices (~45 MB) are saved
        // after it, a few at a time with retries (src/lib/offline.ts): one big step got stuck on slow connections.
        globPatterns: ['**/*.{js,css,html,svg,woff2,webmanifest}', '*.png'],
        // The big dictionary is optional: parents download it from Settings into its own cache.
        globIgnores: ['pack/**'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/cards/'),
            handler: 'CacheFirst',
            options: { cacheName: 'suylo-pictures' },
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/audio/') || url.pathname.includes('/sentences/'),
            handler: 'CacheFirst',
            options: { cacheName: 'suylo-audio' },
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/pack/'),
            handler: 'CacheFirst',
            options: { cacheName: 'suylo-pack' },
          },
        ],
      },
      manifest: {
        name: 'Suylo — кыргызча сүйлөгөн карточкалар',
        short_name: 'Suylo',
        description: 'Аутизм спектриндеги балдар үчүн бекер, интернетсиз иштеген кыргызча карточкалар.',
        lang: 'ky',
        start_url: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#2A58CF',
        theme_color: '#ffffff',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
