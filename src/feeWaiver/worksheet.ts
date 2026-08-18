import fontkit from '@pdf-lib/fontkit'
import { PDFDocument } from 'pdf-lib'
import { primeFontShaping, wrapText } from '../pdf/PdfFillService'
import type { FeeWaiverResult } from './engine'

export interface FeeWaiverWorksheetInput {
  caseLabel: string
  householdSize: number
  annualIncome: number
  receivesPublicBenefits: boolean
  result: FeeWaiverResult
}

const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const MARGIN = 54
const BODY_SIZE = 11
const BODY_LINE_HEIGHT = 16
const TITLE_SIZE = 15

const ELIGIBILITY_LABEL: Record<FeeWaiverResult['eligibility'], string> = {
  eligible: 'LIKELY ELIGIBLE',
  not_eligible: 'LIKELY NOT ELIGIBLE',
  undetermined: 'UNDETERMINED',
}

/**
 * An informational worksheet showing the eligibility computation this app actually
 * ran — explicitly NOT the official court fee-waiver application (California's is
 * Form FW-001; other courts have their own). This app doesn't have a real copy of
 * any specific court's numbered form on file, and drawing one up while labeling it
 * official would be exactly the fabricated-compliance this app avoids elsewhere
 * (see certificateOfService.ts, Chunk 23, for the same reasoning). The worksheet
 * says so on its own first line, not just in a code comment.
 */
export async function generateFeeWaiverWorksheet(input: FeeWaiverWorksheetInput, fontBytes: Uint8Array): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  pdfDoc.registerFontkit(fontkit)
  const font = await pdfDoc.embedFont(fontBytes)
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  const contentWidth = PAGE_WIDTH - MARGIN * 2

  const disclaimer =
    'This is an informational worksheet showing how this eligibility estimate was calculated. It is NOT an official court form. Ask the court clerk for the actual fee waiver application to request a waiver.'
  const benefitsLine = `Receiving qualifying public benefits: ${input.receivesPublicBenefits ? 'Yes' : 'No'}`
  const incomeLine = `Household size: ${input.householdSize}    Annual household income: $${input.annualIncome.toLocaleString()}`
  const resultLine = `Result: ${ELIGIBILITY_LABEL[input.result.eligibility]}`
  const ruleLine = input.result.ruleCitation ? `Rule: ${input.result.ruleCitation}` : 'Rule: (none on file for this jurisdiction)'

  primeFontShaping(font, [
    'FEE WAIVER ELIGIBILITY WORKSHEET',
    input.caseLabel,
    disclaimer,
    incomeLine,
    benefitsLine,
    resultLine,
    ruleLine,
    input.result.explanation,
  ])

  let y = PAGE_HEIGHT - MARGIN
  page.drawText('FEE WAIVER ELIGIBILITY WORKSHEET', { x: MARGIN, y, size: TITLE_SIZE, font })
  y -= TITLE_SIZE + 16

  page.drawText(input.caseLabel, { x: MARGIN, y, size: BODY_SIZE, font })
  y -= BODY_LINE_HEIGHT * 2

  for (const line of wrapText(disclaimer, contentWidth, BODY_SIZE, font)) {
    page.drawText(line, { x: MARGIN, y, size: BODY_SIZE, font })
    y -= BODY_LINE_HEIGHT
  }
  y -= BODY_LINE_HEIGHT

  for (const line of [incomeLine, benefitsLine, resultLine, ruleLine]) {
    page.drawText(line, { x: MARGIN, y, size: BODY_SIZE, font })
    y -= BODY_LINE_HEIGHT
  }
  y -= BODY_LINE_HEIGHT

  for (const line of wrapText(input.result.explanation, contentWidth, BODY_SIZE, font)) {
    page.drawText(line, { x: MARGIN, y, size: BODY_SIZE, font })
    y -= BODY_LINE_HEIGHT
  }

  return pdfDoc.save()
}
