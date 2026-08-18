import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves project sites from /<repo>/, so assets must be referenced
// relatively. Combined with HashRouter this makes the build host-agnostic — the same
// bundle works from a subpath, a custom domain, or a local preview.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'Pro Se Legal Case Manager',
        short_name: 'Case Manager',
        description:
          'Offline-first case management for self-represented litigants: documents, deadlines, forms and filings.',
        theme_color: '#08080b',
        background_color: '#08080b',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Case files are large; the WASM payloads (OCR, and Argon2 in an earlier
        // chunk) push past Workbox's default 2 MiB precache ceiling.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        // `gz` here is the OCR language data (public/ocr/eng.traineddata.gz) — Chunk
        // 9's self-hosted Tesseract assets. Without it in the precache manifest, OCR
        // would silently depend on network access the first time it's used, which
        // defeats the point of self-hosting it in an offline-first app.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm,gz}'],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
})
