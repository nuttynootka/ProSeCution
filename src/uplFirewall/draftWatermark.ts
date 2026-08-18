import fontkit from '@pdf-lib/fontkit'
import { degrees, PDFDocument, rgb, type PDFFont } from 'pdf-lib'
import { primeFontShaping } from '../pdf/PdfFillService'

export const DEFAULT_DRAFT_WATERMARK_TEXT = 'WORKING DRAFT — PREPARED BY A SELF-REPRESENTED LITIGANT'

const ANGLE_DEGREES = 35
const ANGLE_RADIANS = (ANGLE_DEGREES * Math.PI) / 180
const MAX_FONT_SIZE = 26
const MIN_FONT_SIZE = 8
/** Keeps the rotated line's full rendered width within the page on both axes — see the real, empirically-verified bug this works around below. */
const PAGE_FRACTION = 0.8

/**
 * Shrinks the font size until the watermark's rotated bounding box comfortably
 * fits on the page. This isn't just a cosmetic choice: real testing (rendering the
 * actual output, then separately re-extracting it) found that pdf.js silently
 * drops leading/trailing characters of a text run whose drawn position extends
 * beyond the page's own bounds — confirmed reproducible with this exact font, and
 * specifically tied to the text actually running off-page, not to rotation or long
 * text on their own (a short text drawn off-page showed the same truncation; the
 * same long text kept fully on-page extracted completely). Whether the underlying
 * cause is in pdf-lib's content-stream generation or pdf.js's own text layer, the
 * fix that actually works is the same either way: never draw text whose rotated
 * extent leaves the page.
 */
function fitFontSize(font: PDFFont, text: string, targetWidth: number): number {
  let size = MAX_FONT_SIZE
  while (size > MIN_FONT_SIZE && font.widthOfTextAtSize(text, size) > targetWidth) size -= 1
  return size
}

/**
 * Stamps a diagonal, semi-transparent watermark across every page of an existing
 * PDF — the blueprint's "Working Draft" marking that's meant to stay on an
 * AI-drafted document until a real person reviews and adopts it (see
 * AdoptionGate). A pure transformation: takes bytes, returns new bytes. It doesn't
 * know or track whether something has been "adopted" yet — no consumer does, see
 * AdoptionGate's doc comment for why this is infra built ahead of its consumer —
 * that state belongs to whatever future screen calls this, not to the stamping
 * function itself.
 */
export async function stampDraftWatermark(
  pdfBytes: Uint8Array,
  fontBytes: Uint8Array,
  text: string = DEFAULT_DRAFT_WATERMARK_TEXT,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes)
  pdfDoc.registerFontkit(fontkit)
  const font = await pdfDoc.embedFont(fontBytes)
  primeFontShaping(font, [text])

  for (const page of pdfDoc.getPages()) {
    const { width, height } = page.getSize()
    const targetWidth = Math.min(width, height) * PAGE_FRACTION
    const fontSize = fitFontSize(font, text, targetWidth)
    const textWidth = font.widthOfTextAtSize(text, fontSize)

    // Centers the ROTATED line on the page's center point — offsetting by half the
    // width along the rotation's own direction, not the unrotated horizontal axis,
    // which is what actually keeps it symmetric (and on-page) once rotated.
    const x = width / 2 - (textWidth / 2) * Math.cos(ANGLE_RADIANS)
    const y = height / 2 - (textWidth / 2) * Math.sin(ANGLE_RADIANS)

    page.drawText(text, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(0.6, 0.1, 0.1),
      opacity: 0.25,
      rotate: degrees(ANGLE_DEGREES),
    })
  }

  return pdfDoc.save()
}
