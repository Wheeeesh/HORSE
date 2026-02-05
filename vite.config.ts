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
        globPatterns: ['**/*.{js,mjs,css,html,ico,png,svg,woff,woff2,wasm}'],
        // Don't cache external resources
        runtimeCaching: [],
      },
      manifest: {
        name: 'pwr.horse',
        short_name: 'pwr.horse',
        description: 'Local-first file converter and QR code generator',
        theme_color: '#000000',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/logo.png',
            sizes: 'any',
            type: 'image/png',
          },
          {
            src: '/logo.png',
            sizes: 'any',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
  // Optimize heavy libraries for lazy loading
  optimizeDeps: {
    // Don't pre-bundle heavy libraries - they're dynamically imported
    exclude: ['pdfjs-dist', 'xlsx', '@ffmpeg/ffmpeg', '@ffmpeg/core', '@ffmpeg/util'],
  },
  build: {
    rollupOptions: {
      output: {
        // Manual chunks for heavy libraries to ensure they're lazy-loaded
        manualChunks: {
          'pdfjs': ['pdfjs-dist'],
          'xlsx': ['xlsx'],
        },
      },
    },
  },
})
