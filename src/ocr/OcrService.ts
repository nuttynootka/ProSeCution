import { createWorker } from 'tesseract.js'

export interface OcrResult {
  text: string
  /** Tesseract's mean confidence across recognized words, 0-100. */
  confidence: number
}

/**
 * Self-hosted OCR assets under public/ocr/ (~5.8MB: WASM core, worker script, English
 * traineddata) rather than Tesseract.js's default of fetching from jsdelivr's CDN at
 * runtime — same reasoning as the self-hosted fonts in Chunk 2: this is an
 * offline-first app, and OCR shouldn't have a hidden network dependency the rest of
 * the app doesn't have. `import.meta.env.BASE_URL` (not a hardcoded `/ocr/...`) so
 * this still resolves correctly when the app is deployed under a subpath, e.g.
 * GitHub Pages' `/ProSeCution/`.
 *
 * SIMD-only WASM build: this app is Android/Chrome-only, and Chrome has shipped WASM
 * SIMD since 2021 — shipping the non-SIMD fallback variant too would just be another
 * ~2.9MB nothing here would ever load.
 */
const ASSET_BASE = `${import.meta.env.BASE_URL}ocr`

/**
 * Runs OCR on a single image and returns its text and confidence. Creates and tears
 * down a fresh Tesseract worker per call rather than keeping one warm across calls —
 * simpler lifecycle, no idle WASM heap sitting in memory between captures, at the
 * cost of ~1-2s of worker startup on every call. Revisit if a future chunk's usage
 * pattern (e.g. batch reprocessing) makes that cost worth pooling workers for.
 */
export async function recognizeText(image: Blob | string): Promise<OcrResult> {
  const worker = await createWorker('eng', 1, {
    corePath: `${ASSET_BASE}/tesseract-core-simd-lstm.js`,
    workerPath: `${ASSET_BASE}/worker.min.js`,
    langPath: ASSET_BASE,
    gzip: true,
    // Tesseract.js defaults to instantiating the worker from a blob: URL wrapping
    // workerPath's contents — meant for loading a worker script cross-origin (e.g.
    // its default jsdelivr CDN), which browsers otherwise block. That wrapping
    // breaks the WASM glue code's *own* relative-path lookup for its sibling .wasm
    // file: a blob: URL has no real path to resolve "tesseract-core-simd-lstm.wasm"
    // against, so the fetch fails with "Failed to parse URL." Assets are self-hosted
    // same-origin here, so the cross-origin workaround isn't needed — loading the
    // worker directly from its real URL keeps relative resolution intact.
    workerBlobURL: false,
  })

  try {
    const {
      data: { text, confidence },
    } = await worker.recognize(image)
    return { text: text.trim(), confidence }
  } finally {
    await worker.terminate()
  }
}

/**
 * Runs OCR and returns a real, positioned, invisible-text-over-image searchable
 * PDF — Tesseract's own PDF renderer (the same one behind its `-c tessedit_
 * create_pdf=1` CLI flag) does the actual per-word placement, not hand-rolled
 * coordinate math here. This is the blueprint's "embedded OCR layer": a scanned
 * document becomes text-searchable/selectable the way an e-filing system expects,
 * without discarding the original page image underneath.
 */
export async function recognizeToSearchablePdf(image: Blob | string, pdfTitle = 'Scanned document'): Promise<Uint8Array> {
  const worker = await createWorker('eng', 1, {
    corePath: `${ASSET_BASE}/tesseract-core-simd-lstm.js`,
    workerPath: `${ASSET_BASE}/worker.min.js`,
    langPath: ASSET_BASE,
    gzip: true,
    workerBlobURL: false,
  })

  try {
    const { data } = await worker.recognize(image, { pdfTitle }, { pdf: true, text: false })
    if (!data.pdf) throw new Error('Tesseract did not produce a PDF output')
    return new Uint8Array(data.pdf)
  } finally {
    await worker.terminate()
  }
}
