// Pinned to the 5.x line deliberately, not just whatever's newest: pdfjs-dist 6.x's
// internal render-time caching calls `Map.prototype.getOrInsertComputed`, a JS
// Map/WeakMap "upsert" method still too new for the Chromium this was verified
// against (141, itself a recent release) — confirmed by `page.render()` throwing
// `getOrInsertComputed is not a function` under 6.2.108, and rendering correctly
// once downgraded to 5.4.624. Real Android Chrome versions in the field lag behind
// desktop releases, so bumping past 5.x needs the same real-browser render check
// this chunk did, not just "the version number went up and tests still pass" (tests
// can't catch this — the render call path isn't Vitest-reachable at all, see below).
import * as pdfjsLib from 'pdfjs-dist'
// Vite's `?url` suffix resolves to the worker's final built, fingerprinted URL —
// self-hosted and cache-busted automatically, the same "no CDN, no hidden network
// dependency" requirement the OCR assets (Chunk 9) needed a manual public/ copy for.
// pdf.js's own bundler-integration model makes that copy unnecessary here.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export interface PdfDocumentHandle {
  pageCount: number
  /** Renders one page (1-indexed, matching pdf.js's own convention) into the given canvas at the given CSS-pixel scale. */
  renderPage(pageNum: number, scale: number, canvas: HTMLCanvasElement): Promise<void>
  /** Releases the document's worker-side resources. Not optional to call — pdf.js keeps a document's data in the worker until this runs. */
  destroy(): void
}

export async function loadPdf(data: ArrayBuffer | Uint8Array): Promise<PdfDocumentHandle> {
  // `destroy()` lives on the loading task, not the resolved document proxy — both
  // must be kept, not just the awaited `.promise` result.
  const loadingTask = pdfjsLib.getDocument({ data })
  const doc = await loadingTask.promise

  return {
    pageCount: doc.numPages,
    async renderPage(pageNum, scale, canvas) {
      const page = await doc.getPage(pageNum)
      const viewport = page.getViewport({ scale })
      canvas.width = viewport.width
      canvas.height = viewport.height

      await page.render({ canvas, viewport }).promise
    },
    destroy() {
      void loadingTask.destroy()
    },
  }
}
