import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib'
import type { FieldMapping, TemplateField } from './types'

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
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(templateBytes)
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
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
