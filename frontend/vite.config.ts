import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Basic app-shell caching for offline support.
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      },
      includeAssets: ['favicon.svg'],
      manifest: {
        name: '21 Bit Coffee — Inventory',
        short_name: '21 Bit Coffee',
        description:
          'Cafeteria/Production inventory management: sales, waste, stock and restock requests.',
        theme_color: '#6F4E37',
        background_color: '#FDFAF6',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      devOptions: {
        // Lets the service worker run under `npm run dev` for easier testing.
        enabled: true,
      },
    }),
  ],
})
