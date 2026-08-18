import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { checkFeeWaiverEligibility } from './engine'
import { generateFeeWaiverWorksheet, type FeeWaiverWorksheetInput } from './worksheet'

const FONT_BYTES = new Uint8Array(readFileSync('public/fonts/ibm-plex-mono-400.woff2'))

/** Real pdf.js text extraction — see PdfFillService.test.ts. Whitespace collapsed — see certificateOfService.test.ts. */
async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise
  const page = await doc.getPage(1)
  const content = await page.getTextContent()
  const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ')
  await doc.destroy()
  return text.replace(/\s+/g, ' ').trim()
}

describe('generateFeeWaiverWorksheet', () => {
  it('produces a real PDF, explicitly labeled as not an official form', async () => {
    const result = checkFeeWaiverEligibility('CA', { householdSize: 1, annualIncome: 20_000, receivesPublicBenefits: false })
    const input: FeeWaiverWorksheetInput = {
      caseLabel: 'Los Angeles County, CA',
      householdSize: 1,
      annualIncome: 20_000,
      receivesPublicBenefits: false,
      result,
    }
    const bytes = await generateFeeWaiverWorksheet(input, FONT_BYTES)
    expect(Buffer.from(bytes.slice(0, 5)).toString('latin1')).toBe('%PDF-')
    const text = await extractPdfText(bytes)
    expect(text).toContain('NOT an official court form')
    expect(text).toContain('LIKELY ELIGIBLE')
    expect(text).toContain('Cal. Gov. Code § 68632(b)(1)')
    expect(text).toContain('Household size: 1')
    expect(text).toContain('$20,000')
  })

  it('draws the real not-eligible result and explanation', async () => {
    const result = checkFeeWaiverEligibility('CA', { householdSize: 1, annualIncome: 90_000, receivesPublicBenefits: false })
    const bytes = await generateFeeWaiverWorksheet(
      { caseLabel: 'Los Angeles County, CA', householdSize: 1, annualIncome: 90_000, receivesPublicBenefits: false, result },
      FONT_BYTES,
    )
    const text = await extractPdfText(bytes)
    expect(text).toContain('LIKELY NOT ELIGIBLE')
    expect(text).toContain('exceeds')
  })

  it('draws an honest undetermined result for federal, with no rule threshold claimed', async () => {
    const result = checkFeeWaiverEligibility('federal', { householdSize: 1, annualIncome: 1, receivesPublicBenefits: false })
    const bytes = await generateFeeWaiverWorksheet(
      { caseLabel: 'N.D. Cal., federal', householdSize: 1, annualIncome: 1, receivesPublicBenefits: false, result },
      FONT_BYTES,
    )
    const text = await extractPdfText(bytes)
    expect(text).toContain('UNDETERMINED')
    expect(text).toContain('28 U.S.C. § 1915(a)(1)')
    expect(text).toContain('affidavit')
  })
})
