import fontkit from '@pdf-lib/fontkit'
import { PDFDocument } from 'pdf-lib'
// Imported directly from PdfFillService, not the `../pdf` barrel — that barrel also
// statically re-exports PdfService, which touches `DOMMatrix` at import time (a
// browser-only global) and breaks importing this module from plain Node, e.g. Vitest.
import { primeFontShaping, wrapText } from '../pdf/PdfFillService'
import type { ServiceMethod } from './types'

export interface CertificateOfServiceInput {
  /** e.g. "Los Angeles County, CA — Case No. 24CV5678" — pre-formatted by the caller, which already knows how to display a case. */
  caseLabel: string
  documentDescription: string
  partyName: string
  serviceMethod: ServiceMethod
  serviceDate: number
  serviceAddress?: string
}

const PAGE_WIDTH = 612 // US Letter, points
const PAGE_HEIGHT = 792
const MARGIN = 54
const BODY_SIZE = 11
const BODY_LINE_HEIGHT = 16
const TITLE_SIZE = 15

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

function methodStatement(input: CertificateOfServiceInput): string {
  switch (input.serviceMethod) {
    case 'mail': {
      const address = input.serviceAddress?.trim() || '[address not provided]'
      return `by depositing a true and correct copy in the United States mail, postage prepaid, addressed to: ${address}`
    }
    case 'personal':
      return 'by personally delivering a true and correct copy to the party named above'
    case 'electronic':
      return "by electronic transmission to the party named above, with that party's consent to electronic service"
  }
}

/**
 * A plain, jurisdiction-neutral Certificate of Service — the format nearly every
 * federal and state court accepts as proof a filing was served, not a specific
 * state's own numbered court form. This app doesn't have a real Judicial-Council-
 * style form on file to fill for this, and drawing one up from scratch while
 * labeling it as an official numbered form would be exactly the kind of fabricated
 * compliance the rest of this app avoids (see Chunk 20's compliance checker, which
 * is explicit about being a partial checklist, not a PDF/A conformance claim).
 *
 * Draws with a real embedded font via fontkit (the same self-hosted font
 * `fillTemplate` uses, Chunk 20), not `StandardFonts` — so a document this app
 * generates from scratch, unlike a filled-in third-party template, genuinely passes
 * Chunk 20's own "fonts embedded" compliance check.
 */
export async function generateCertificateOfService(
  input: CertificateOfServiceInput,
  fontBytes: Uint8Array,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  pdfDoc.registerFontkit(fontkit)
  const font = await pdfDoc.embedFont(fontBytes)
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  const contentWidth = PAGE_WIDTH - MARGIN * 2

  const paragraphs = [
    `I certify that on ${formatDate(input.serviceDate)}, I served the following document:`,
    input.documentDescription,
    `on ${input.partyName}, ${methodStatement(input)}.`,
  ]
  const executedLine = `Executed on ${formatDate(Date.now())}.`

  primeFontShaping(font, ['CERTIFICATE OF SERVICE', input.caseLabel, ...paragraphs, executedLine, 'Signature'])

  let y = PAGE_HEIGHT - MARGIN
  page.drawText('CERTIFICATE OF SERVICE', { x: MARGIN, y, size: TITLE_SIZE, font })
  y -= TITLE_SIZE + 20

  page.drawText(input.caseLabel, { x: MARGIN, y, size: BODY_SIZE, font })
  y -= BODY_LINE_HEIGHT * 2

  for (const paragraph of paragraphs) {
    for (const line of wrapText(paragraph, contentWidth, BODY_SIZE, font)) {
      page.drawText(line, { x: MARGIN, y, size: BODY_SIZE, font })
      y -= BODY_LINE_HEIGHT
    }
    y -= BODY_LINE_HEIGHT
  }

  y -= BODY_LINE_HEIGHT * 2
  page.drawText(executedLine, { x: MARGIN, y, size: BODY_SIZE, font })

  y -= BODY_LINE_HEIGHT * 3
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 220, y }, thickness: 1 })
  y -= 14
  page.drawText('Signature', { x: MARGIN, y, size: 9, font })

  return pdfDoc.save()
}
