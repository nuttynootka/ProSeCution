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

export interface PageSize {
  /** In unscaled PDF page points (pdf.js viewport units at scale 1) — the same unit `TemplateField.boundingBox` is defined in (Chunk 17's types.ts). */
  width: number
  height: number
}

export interface PdfTextItem {
  text: string
  /** Axis-aligned enclosing box, in the same top-down scale-1 point coordinates as `getPageSize`/`TemplateField.boundingBox`. Approximates unrotated text (the overwhelming majority of court forms) as a straight rectangle — good enough for Agent C's (Chunk 40) review-before-use field suggestions, not a general PDF text-layout engine. */
  boundingBox: { left: number; top: number; width: number; height: number }
}

export interface PdfDocumentHandle {
  pageCount: number
  /** Renders one page (1-indexed, matching pdf.js's own convention) into the given canvas at the given CSS-pixel scale. */
  renderPage(pageNum: number, scale: number, canvas: HTMLCanvasElement): Promise<void>
  /** The page's own size at scale 1 — Template Studio (Chunk 18) needs this to convert between on-screen tap coordinates and the point-based coordinates field mappings are stored in. */
  getPageSize(pageNum: number): Promise<PageSize>
  /** Real text items (pdf.js `getTextContent()`) with position data, for Agent C's (Chunk 40) field-suggestion input. Empty for a scanned/image-only page with no text layer — callers must treat that as "no extractable text", not silently produce nothing. */
  getPageTextItems(pageNum: number): Promise<PdfTextItem[]>
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
    async getPageSize(pageNum) {
      const page = await doc.getPage(pageNum)
      const { width, height } = page.getViewport({ scale: 1 })
      return { width, height }
    },
    async getPageTextItems(pageNum) {
      const page = await doc.getPage(pageNum)
      const viewport = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      const items: PdfTextItem[] = []
      for (const raw of content.items) {
        if (!('str' in raw) || !raw.str.trim()) continue
        const originX = raw.transform[4]
        const originY = raw.transform[5]
        const [x0, y0] = viewport.convertToViewportPoint(originX, originY)
        const [x1, y1] = viewport.convertToViewportPoint(originX + raw.width, originY + raw.height)
        items.push({
          text: raw.str,
          boundingBox: {
            left: Math.min(x0, x1),
            top: Math.min(y0, y1),
            width: Math.abs(x1 - x0),
            height: Math.abs(y1 - y0),
          },
        })
      }
      return items
    },
    destroy() {
      void loadingTask.destroy()
    },
  }
}
