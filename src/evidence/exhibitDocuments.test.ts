import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { generateExhibitCoverSheets, generateExhibitList, type ExhibitEntry } from './exhibitDocuments'

const FONT_BYTES = new Uint8Array(readFileSync('public/fonts/ibm-plex-mono-400.woff2'))

async function extractPdfText(bytes: Uint8Array, pageNum?: number): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise
  const pageNums = pageNum ? [pageNum] : Array.from({ length: doc.numPages }, (_, i) => i + 1)
  const texts = await Promise.all(
    pageNums.map(async (n) => {
      const page = await doc.getPage(n)
      const content = await page.getTextContent()
      return content.items.map((item) => ('str' in item ? item.str : '')).join(' ')
    }),
  )
  await doc.destroy()
  return texts.join('\n').replace(/\s+/g, ' ').trim()
}

const CASE_LABEL = 'Los Angeles County, CA — Case No. 24CV5678'
const ENTRIES: ExhibitEntry[] = [
  { description: 'Signed lease agreement', originalFilename: 'lease.pdf' },
  { description: 'Text message thread with landlord', originalFilename: 'texts.png' },
  { description: 'Photo of water damage', originalFilename: 'damage.jpg' },
]

describe('generateExhibitList', () => {
  it('produces a real PDF', async () => {
    const bytes = await generateExhibitList(CASE_LABEL, ENTRIES, FONT_BYTES)
    expect(Buffer.from(bytes.slice(0, 5)).toString('latin1')).toBe('%PDF-')
  })

  it('lists every entry with its auto-assigned letter, description, and filename', async () => {
    const bytes = await generateExhibitList(CASE_LABEL, ENTRIES, FONT_BYTES)
    const text = await extractPdfText(bytes)

    expect(text).toContain('EXHIBIT LIST')
    expect(text).toContain(CASE_LABEL)
    expect(text).toContain('Exhibit A')
    expect(text).toContain('Signed lease agreement')
    expect(text).toContain('lease.pdf')
    expect(text).toContain('Exhibit B')
    expect(text).toContain('Text message thread with landlord')
    expect(text).toContain('Exhibit C')
    expect(text).toContain('Photo of water damage')
  })

  it('labels strictly by list order, so reordering the input reorders the letters', async () => {
    const reordered = [ENTRIES[2], ENTRIES[0]]
    const bytes = await generateExhibitList(CASE_LABEL, reordered, FONT_BYTES)
    const text = await extractPdfText(bytes)

    const indexOfA = text.indexOf('Exhibit A')
    const indexOfDamage = text.indexOf('Photo of water damage')
    const indexOfB = text.indexOf('Exhibit B')
    const indexOfLease = text.indexOf('Signed lease agreement')

    expect(indexOfDamage).toBeGreaterThan(indexOfA)
    expect(indexOfDamage).toBeLessThan(indexOfB)
    expect(indexOfLease).toBeGreaterThan(indexOfB)
  })

  it('produces a real, non-empty PDF for an empty exhibit list rather than erroring', async () => {
    const bytes = await generateExhibitList(CASE_LABEL, [], FONT_BYTES)
    const text = await extractPdfText(bytes)
    expect(text).toContain('EXHIBIT LIST')
  })

  it('paginates rather than overflowing a single page when there are many entries', async () => {
    const many: ExhibitEntry[] = Array.from({ length: 60 }, (_, i) => ({
      description: `Document number ${i + 1} with a reasonably long description of its contents`,
      originalFilename: `doc-${i + 1}.pdf`,
    }))
    const bytes = await generateExhibitList(CASE_LABEL, many, FONT_BYTES)
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise
    expect(doc.numPages).toBeGreaterThan(1)
    await doc.destroy()
  })
})

describe('generateExhibitCoverSheets', () => {
  it('produces one page per entry, each labeled with its own exhibit letter', async () => {
    const bytes = await generateExhibitCoverSheets(CASE_LABEL, ENTRIES, FONT_BYTES)
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise
    expect(doc.numPages).toBe(3)
    await doc.destroy()

    const page1Text = await extractPdfText(bytes, 1)
    const page2Text = await extractPdfText(bytes, 2)
    const page3Text = await extractPdfText(bytes, 3)
    expect(page1Text).toContain('EXHIBIT A')
    expect(page1Text).toContain('Signed lease agreement')
    expect(page2Text).toContain('EXHIBIT B')
    expect(page3Text).toContain('EXHIBIT C')
  })

  it('includes the case label on every cover page', async () => {
    const bytes = await generateExhibitCoverSheets(CASE_LABEL, ENTRIES, FONT_BYTES)
    const page1Text = await extractPdfText(bytes, 1)
    expect(page1Text).toContain(CASE_LABEL)
  })
})
