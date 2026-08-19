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
  build: {
    // Default (500 KiB) now reads as a false positive: Chunk 48's route-level
    // React.lazy() split (App.tsx) already separates this app's genuinely heavy
    // dependencies — pdf-lib+fontkit (~1.15 MB) and pdf.js's core (~445 KB) — into
    // their own chunks that only load when a route actually needing them is
    // visited, not as part of the initial bundle (which dropped from ~2.1 MB to
    // ~315 KB from this same change — see App.tsx's own doc comment). Raised just
    // above the larger of those two real, unavoidable, already-lazy chunks so the
    // warning only fires again for a genuinely new, unsplit problem.
    chunkSizeWarningLimit: 1200,
  },
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
})
