import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, type PDFFont, type PDFPage } from 'pdf-lib'
import type { FieldMapping, TemplateField } from './types'

let cachedFontBytes: Uint8Array | null = null

/**
 * Loads the real embeddable font `fillTemplate` draws with — IBM Plex Mono,
 * self-hosted already for the UI (Chunk 2), reused here rather than a second font
 * asset. This matters for more than consistency: pdf-lib's `StandardFonts` helper
 * (the obvious first choice, used until this chunk) references one of the 14 PDF
 * "standard" fonts by *name* and does not embed actual glyph data — a PDF/A
 * conformance requirement (Chunk 20's compliance checker) is that every font used is
 * actually embedded. Fetched and cached separately from `fillTemplate` itself so
 * that function stays pure and unit-testable (font bytes passed in, not fetched
 * inside it) — `fetch`/`import.meta.env.BASE_URL` are real-browser-only concerns.
 */
export async function loadFillFont(): Promise<Uint8Array> {
  if (cachedFontBytes) return cachedFontBytes
  const res = await fetch(`${import.meta.env.BASE_URL}fonts/ibm-plex-mono-400.woff2`)
  cachedFontBytes = new Uint8Array(await res.arrayBuffer())
  return cachedFontBytes
}

/** Resolved values, keyed by `TemplateField.fieldId` — this module doesn't know about case data or global keys, only what text goes in which box. */
export interface FillFieldValues {
  [fieldId: string]: string
}

const HORIZONTAL_INSET = 2
const MAX_FONT_SIZE = 12

/**
 * Fills a template with the given values and flattens the result to a static,
 * non-interactive PDF — the blueprint's "AcroForm + manual mapping... export
 * flattened PDFs." "Manual mapping" is the operative half here: this app's field
 * positions come entirely from Chunk 18's tap-to-place Template Studio, not from
 * detecting the source PDF's own interactive form widgets (a template being a blank
 * scanned/printed form is the common case this was built for, and such a form has no
 * real AcroForm fields to detect in the first place). `form.flatten()` is still
 * called unconditionally: if the source PDF happens to already have real, unrelated
 * form fields, flattening them prevents an empty interactive field showing on top of
 * our own drawn text; if it has none (the common case), this is a harmless no-op.
 *
 * `boundingBox.top` is measured from the page's top (Chunk 18's convention, matching
 * pdf.js's rendered viewport) — PDF's own coordinate system measures from the
 * bottom-left with Y increasing upward, so this is the one place that flip happens,
 * exactly as promised in `types.ts`'s `BoundingBox` doc comment.
 */
export async function fillTemplate(
  templateBytes: Uint8Array,
  mappings: FieldMapping[],
  values: FillFieldValues,
  fontBytes: Uint8Array,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(templateBytes)
  pdfDoc.registerFontkit(fontkit)
  const font = await pdfDoc.embedFont(fontBytes)
  primeFontShaping(font, Object.values(values))
  const pages = pdfDoc.getPages()

  for (const mapping of mappings) {
    const page = pages[mapping.pageNum - 1]
    if (!page) continue
    const { height: pageHeight } = page.getSize()

    for (const field of mapping.fields) {
      const value = values[field.fieldId]
      if (!value) continue
      drawField(page, font, field, value, pageHeight)
    }
  }

  pdfDoc.getForm().flatten()
  return pdfDoc.save()
}

function drawField(page: PDFPage, font: PDFFont, field: TemplateField, value: string, pageHeight: number): void {
  const { left, top, width, height } = field.boundingBox

  if (field.type === 'SINGLE_LINE') {
    const fontSize = Math.min(MAX_FONT_SIZE, height * 0.7)
    const y = pageHeight - top - height + (height - fontSize) / 2
    page.drawText(value, { x: left + HORIZONTAL_INSET, y, size: fontSize, font })
    return
  }

  const fontSize = Math.min(MAX_FONT_SIZE, field.lineHeight * 0.7)
  const lines = wrapText(value, width - HORIZONTAL_INSET * 2, fontSize, font).slice(0, field.maxLines)
  let y = pageHeight - top - field.baselineYOffset - fontSize
  for (const line of lines) {
    page.drawText(line, { x: left + HORIZONTAL_INSET, y, size: fontSize, font })
    y -= field.lineHeight
  }
}

/**
 * Works around a real bug empirically found in this exact font + fontkit +
 * pdf-lib combination: `pdfDoc.embedFont()`'s glyph shaping (`font.layout()`,
 * called internally by both `drawText` and `widthOfTextAtSize`) is only reliably
 * correct for a given character the *first* time that character is shaped after
 * embedding. When two DIFFERENT `page.drawText()` calls each introduce a
 * character the font hasn't shaped yet — confirmed reproducible with as little as
 * drawing `':'` in one call, then `'a.b'` in a later, separate call — the second
 * call's period silently comes out as the wrong glyph (visually rendering as a
 * different letter entirely, not just a wrong Unicode label on copy/paste).
 * Combining everything into one drawText call doesn't have the bug, but this app
 * draws many separate calls (one per line, one per field) by necessity.
 *
 * The fix that empirically eliminates it: shape the *complete* set of text this
 * document will ever draw once, up front, via a single `widthOfTextAtSize` call
 * (chosen over `encodeText` only because it doesn't require also drawing
 * anything) — before any real `drawText` call happens. Whatever internal
 * per-character shaping cache fontkit builds ends up correctly populated for
 * every character used, and every later real draw call reads consistently
 * correct results from it. Call this immediately after `embedFont`, with every
 * string the caller intends to draw with that font.
 */
export function primeFontShaping(font: PDFFont, texts: string[]): void {
  font.widthOfTextAtSize(texts.join(' '), 1)
}

/** Greedy word wrap using the font's own measured width — a fixed characters-per-line guess would be wrong for any non-monospace font (Helvetica here) and every font size this scales with. */
export function wrapText(text: string, maxWidth: number, fontSize: number, font: PDFFont): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (current === '' || font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate
    } else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}
