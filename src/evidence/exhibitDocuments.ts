import fontkit from '@pdf-lib/fontkit'
import { PDFDocument } from 'pdf-lib'
// Imported directly from PdfFillService, not the `../pdf` barrel — that barrel also
// statically re-exports PdfService, which touches `DOMMatrix` at import time (a
// browser-only global) and breaks importing this module from plain Node, e.g. Vitest.
// Same reasoning certificateOfService.ts (Chunk 23) already documents for itself.
import { primeFontShaping, wrapText } from '../pdf/PdfFillService'
import { exhibitLabel } from './exhibitLabels'

export interface ExhibitEntry {
  description: string
  originalFilename: string
}

const PAGE_WIDTH = 612 // US Letter, points
const PAGE_HEIGHT = 792
const MARGIN = 54
const TITLE_SIZE = 16
const BODY_SIZE = 11
const BODY_LINE_HEIGHT = 16
const ROW_GAP = 10

/**
 * A single-document exhibit list: "Exhibit A — <description> (<filename>)" for
 * each entry, in the order given — order is what `exhibitLabel` derives each row's
 * letter from, so reordering the input reorders the labels too. Paginates by
 * starting a fresh page whenever a row wouldn't fit, rather than assuming
 * everything fits on one page (a real case can have dozens of exhibits).
 */
export async function generateExhibitList(caseLabel: string, entries: ExhibitEntry[], fontBytes: Uint8Array): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  pdfDoc.registerFontkit(fontkit)
  const font = await pdfDoc.embedFont(fontBytes)
  const contentWidth = PAGE_WIDTH - MARGIN * 2

  primeFontShaping(font, [
    'EXHIBIT LIST',
    caseLabel,
    ...entries.flatMap((e, i) => [`Exhibit ${exhibitLabel(i)}`, e.description, e.originalFilename]),
  ])

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - MARGIN
  page.drawText('EXHIBIT LIST', { x: MARGIN, y, size: TITLE_SIZE, font })
  y -= TITLE_SIZE + 16
  page.drawText(caseLabel, { x: MARGIN, y, size: BODY_SIZE, font })
  y -= BODY_LINE_HEIGHT * 2

  entries.forEach((entry, i) => {
    const label = `Exhibit ${exhibitLabel(i)}`
    const detail = `${entry.description}${entry.originalFilename ? ` (${entry.originalFilename})` : ''}`
    const detailLines = wrapText(detail, contentWidth - 20, BODY_SIZE, font)
    const rowHeight = BODY_LINE_HEIGHT * (1 + detailLines.length) + ROW_GAP

    if (y - rowHeight < MARGIN) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      y = PAGE_HEIGHT - MARGIN
    }

    page.drawText(label, { x: MARGIN, y, size: BODY_SIZE, font })
    y -= BODY_LINE_HEIGHT
    for (const line of detailLines) {
      page.drawText(line, { x: MARGIN + 20, y, size: BODY_SIZE, font })
      y -= BODY_LINE_HEIGHT
    }
    y -= ROW_GAP
  })

  return pdfDoc.save()
}

/**
 * One divider/cover page per exhibit — meant to be placed ahead of that exhibit's
 * actual document pages when assembling a filing packet or physical binder, the
 * blueprint's "exhibit cover sheets." All cover sheets are produced as a single
 * multi-page PDF (one page per entry, in order) rather than N separate downloads.
 */
export async function generateExhibitCoverSheets(caseLabel: string, entries: ExhibitEntry[], fontBytes: Uint8Array): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  pdfDoc.registerFontkit(fontkit)
  const font = await pdfDoc.embedFont(fontBytes)
  const contentWidth = PAGE_WIDTH - MARGIN * 2

  primeFontShaping(font, ['EXHIBIT', caseLabel, ...entries.flatMap((e, i) => [exhibitLabel(i), e.description])])

  entries.forEach((entry, i) => {
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    const label = exhibitLabel(i)
    const labelSize = 48
    const labelWidth = font.widthOfTextAtSize(`EXHIBIT ${label}`, labelSize)

    page.drawText(`EXHIBIT ${label}`, {
      x: (PAGE_WIDTH - labelWidth) / 2,
      y: PAGE_HEIGHT / 2 + 20,
      size: labelSize,
      font,
    })

    let y = PAGE_HEIGHT / 2 - 40
    const descLines = wrapText(entry.description, contentWidth, BODY_SIZE, font)
    for (const line of descLines) {
      const lineWidth = font.widthOfTextAtSize(line, BODY_SIZE)
      page.drawText(line, { x: (PAGE_WIDTH - lineWidth) / 2, y, size: BODY_SIZE, font })
      y -= BODY_LINE_HEIGHT
    }

    const caseLabelWidth = font.widthOfTextAtSize(caseLabel, BODY_SIZE)
    page.drawText(caseLabel, { x: (PAGE_WIDTH - caseLabelWidth) / 2, y: MARGIN, size: BODY_SIZE, font })
  })

  return pdfDoc.save()
}
