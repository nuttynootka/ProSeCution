import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { checkCompliance } from '../pdf/compliance'
import { generateCertificateOfService, type CertificateOfServiceInput } from './certificateOfService'

// The real self-hosted font, exactly as production loads it (PdfFillService.loadFillFont
// fetches this same file) — not a StandardFonts stand-in, same discipline as
// PdfFillService.test.ts.
const FONT_BYTES = new Uint8Array(readFileSync('public/fonts/ibm-plex-mono-400.woff2'))

/**
 * Real pdf.js text extraction — see PdfFillService.test.ts for why a hex-search over
 * the content stream doesn't work for a fontkit-embedded Type0/CID font. Whitespace
 * is collapsed before returning: pdf.js's own glyph-gap heuristic for deciding where
 * a word boundary belongs is imprecise for this particular embedded font (it also
 * logs a "loca table not found" warning for it), occasionally inserting extra spaces
 * between words that were drawn as a single, correctly-spaced string. The words
 * themselves and their order are what this needs to verify — not pdf.js's own
 * best-effort guess at exactly how many space characters separated them.
 */
async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise
  const page = await doc.getPage(1)
  const content = await page.getTextContent()
  const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ')
  await doc.destroy()
  return text.replace(/\s+/g, ' ').trim()
}

const BASE_INPUT: CertificateOfServiceInput = {
  caseLabel: 'Los Angeles County, CA — Case No. 24CV5678',
  documentDescription: 'Motion to Compel Discovery',
  partyName: 'R. Cordova',
  serviceMethod: 'mail',
  serviceDate: Date.UTC(2026, 2, 3),
  serviceAddress: '123 Main St, Los Angeles, CA 90001',
}

describe('generateCertificateOfService', () => {
  it('produces a real PDF', async () => {
    const bytes = await generateCertificateOfService(BASE_INPUT, FONT_BYTES)
    expect(Buffer.from(bytes.slice(0, 5)).toString('latin1')).toBe('%PDF-')
  })

  it('draws the case label, document description, and party name into the actual PDF text', async () => {
    // Doubles as a regression test for a real font-shaping bug found while building
    // this generator (see PdfFillService.ts's primeFontShaping): the ":" this
    // document draws earlier (in "following document:") corrupted the "." in
    // "R. Cordova" drawn afterward, until that fix.
    const bytes = await generateCertificateOfService(BASE_INPUT, FONT_BYTES)
    const text = await extractPdfText(bytes)
    expect(text).toContain('CERTIFICATE OF SERVICE')
    expect(text).toContain('Los Angeles County, CA — Case No. 24CV5678')
    expect(text).toContain('Motion to Compel Discovery')
    expect(text).toContain('R. Cordova')
    expect(text).toMatch(/March 3, 2026/)
  })

  it('describes mail service with the real address, when provided', async () => {
    const bytes = await generateCertificateOfService(BASE_INPUT, FONT_BYTES)
    const text = await extractPdfText(bytes)
    expect(text).toContain('United States mail')
    expect(text).toContain('123 Main St, Los Angeles, CA 90001')
  })

  it('is honest about a missing mail address rather than leaving a blank', async () => {
    const bytes = await generateCertificateOfService({ ...BASE_INPUT, serviceAddress: undefined }, FONT_BYTES)
    const text = await extractPdfText(bytes)
    expect(text).toContain('[address not provided]')
  })

  it('describes personal service without ever mentioning mail', async () => {
    const bytes = await generateCertificateOfService({ ...BASE_INPUT, serviceMethod: 'personal' }, FONT_BYTES)
    const text = await extractPdfText(bytes)
    expect(text).toContain('personally delivering')
    expect(text).not.toContain('United States mail')
  })

  it('describes electronic service, referencing consent', async () => {
    const bytes = await generateCertificateOfService({ ...BASE_INPUT, serviceMethod: 'electronic' }, FONT_BYTES)
    const text = await extractPdfText(bytes)
    expect(text).toContain('electronic transmission')
    expect(text).toContain('consent')
  })

  it('passes its own compliance checker on fonts embedded — this document, unlike a filled third-party template, has nothing but its own drawn text', async () => {
    const bytes = await generateCertificateOfService(BASE_INPUT, FONT_BYTES)
    const report = await checkCompliance(bytes)
    const fontsCheck = report.checks.find((c) => c.id === 'fonts-embedded')
    expect(fontsCheck?.passed).toBe(true)
  })
})
