import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Precache all assets
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // Don't cache external resources
        runtimeCaching: [],
      },
      manifest: {
        name: 'TADAA',
        short_name: 'TADAA',
        description: 'Local-first file converter and QR code generator',
        theme_color: '#000000',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
          },
          {
            src: '/icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
  // Optimize heavy libraries for lazy loading
  optimizeDeps: {
    // Don't pre-bundle pdfjs-dist - it's dynamically imported
    exclude: ['pdfjs-dist'],
  },
  build: {
    rollupOptions: {
      output: {
        // Manual chunks for heavy libraries to ensure they're lazy-loaded
        manualChunks: {
          'pdfjs': ['pdfjs-dist'],
        },
      },
    },
  },
})
