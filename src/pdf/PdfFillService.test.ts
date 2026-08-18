import { readFileSync } from 'node:fs'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, type PDFFont } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { fillTemplate, wrapText } from './PdfFillService'
import type { FieldMapping, TemplateField } from './types'

// The real self-hosted font fillTemplate embeds in production (see PdfFillService's
// loadFillFont) — using it here too, rather than a synthetic StandardFonts
// substitute, means these tests exercise the exact font-embedding path Chunk 20
// added it for, not a stand-in that happens to share an API.
const FONT_BYTES = new Uint8Array(readFileSync('public/fonts/ibm-plex-mono-400.woff2'))

async function makeTemplateBytes(pageCount = 1): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pageCount; i++) doc.addPage([612, 792])
  return doc.save()
}

/**
 * Verifies drawn text content for real, not just "no exception was thrown" — and
 * genuinely, not by guessing at pdf-lib's internal encoding. A fontkit-embedded
 * TrueType font (what `loadFillFont` uses, see PdfFillService) always comes out as a
 * Type0/CID composite font, whose content stream encodes each glyph as an arbitrary
 * per-font glyph ID, not the character's own code point — an early version of this
 * test tried to hex-search the raw text in the (inflated) content stream and it
 * legitimately found nothing, because that's not what's actually written there.
 * pdf.js's own text-extraction (`page.getTextContent()`, via its Node-targeted
 * "legacy" build — the same library already used elsewhere in this app for
 * rendering, Chunk 17) does the real glyph-ID-to-Unicode decoding a PDF reader
 * actually needs, so using it here is independent, correct verification instead of
 * reverse-engineering pdf-lib's encoding by hand.
 */
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
  return texts.join('\n')
}

const singleLineField: TemplateField = {
  fieldId: 'name',
  type: 'SINGLE_LINE',
  boundingBox: { left: 72, top: 100, width: 200, height: 16 },
}

const multiLineField: TemplateField = {
  fieldId: 'facts',
  type: 'MULTI_LINE_RULED',
  boundingBox: { left: 72, top: 300, width: 150, height: 80 },
  baselineYOffset: 2,
  lineHeight: 16,
  maxLines: 3,
}

describe('fillTemplate', () => {
  it('draws a single-line field\'s value into the output PDF', async () => {
    const template = await makeTemplateBytes(1)
    const mapping: FieldMapping = { id: 'm1', templateId: 't1', pageNum: 1, fields: [singleLineField], createdAt: 0, updatedAt: 0 }

    const result = await fillTemplate(template, [mapping], { name: 'Maria Hartley' }, FONT_BYTES)

    expect(await extractPdfText(result)).toContain('Maria Hartley')
  })

  it('word-wraps a multi-line field across several drawn lines, truncated at maxLines', async () => {
    const template = await makeTemplateBytes(1)
    const mapping: FieldMapping = { id: 'm1', templateId: 't1', pageNum: 1, fields: [multiLineField], createdAt: 0, updatedAt: 0 }
    // At this field's width/lineHeight, wrapText (verified directly below) breaks
    // this into 5 lines — "The defendant" / "breached the" / "agreement on multiple"
    // / "occasions during the" / "relevant period". multiLineField.maxLines is 3, so
    // only the first three should actually make it into the drawn PDF.
    const longText = 'The defendant breached the agreement on multiple occasions during the relevant period'

    const result = await fillTemplate(template, [mapping], { facts: longText }, FONT_BYTES)
    const extracted = await extractPdfText(result)

    // First three lines' words are there...
    expect(extracted).toContain('defendant')
    expect(extracted).toContain('breached')
    expect(extracted).toContain('multiple')
    // ...but content past maxLines is genuinely dropped, not merely wrapped further —
    // an earlier version of this test asserted the opposite by mistake and only
    // caught the real maxLines-truncation behavior once verified against actual
    // extracted text instead of an assumption.
    expect(extracted).not.toContain('relevant')
    expect(extracted).not.toContain('period')
  })

  it('skips a field with no resolved value — draws nothing for it', async () => {
    const template = await makeTemplateBytes(1)
    const mapping: FieldMapping = { id: 'm1', templateId: 't1', pageNum: 1, fields: [singleLineField], createdAt: 0, updatedAt: 0 }

    const result = await fillTemplate(template, [mapping], {}, FONT_BYTES)

    expect(await extractPdfText(result)).not.toContain('Maria Hartley')
  })

  it('draws page-2 fields on page 2, not page 1', async () => {
    const template = await makeTemplateBytes(2)
    const page1Field: TemplateField = { ...singleLineField, fieldId: 'p1field' }
    const page2Field: TemplateField = { ...singleLineField, fieldId: 'p2field' }
    const mappings: FieldMapping[] = [
      { id: 'm1', templateId: 't1', pageNum: 1, fields: [page1Field], createdAt: 0, updatedAt: 0 },
      { id: 'm2', templateId: 't1', pageNum: 2, fields: [page2Field], createdAt: 0, updatedAt: 0 },
    ]

    const result = await fillTemplate(template, mappings, { p1field: 'PAGE-ONE-MARKER', p2field: 'PAGE-TWO-MARKER' }, FONT_BYTES)
    const reloaded = await PDFDocument.load(result)

    expect(reloaded.getPageCount()).toBe(2)
    const page1Text = await extractPdfText(result, 1)
    const page2Text = await extractPdfText(result, 2)
    expect(page1Text).toContain('PAGE-ONE-MARKER')
    expect(page1Text).not.toContain('PAGE-TWO-MARKER')
    expect(page2Text).toContain('PAGE-TWO-MARKER')
    expect(page2Text).not.toContain('PAGE-ONE-MARKER')
  })

  it('draws a period correctly in one field even when an earlier field introduced a colon first', async () => {
    // Regression test for a real bug found while building Chunk 23's certificate
    // generator: this exact font, embedded via fontkit, silently mis-shapes a
    // character in one page.drawText() call if a DIFFERENT character was first
    // introduced to the font in an earlier, separate drawText() call — confirmed by
    // rendering the actual output, not just re-extracting it (a colon drawn in one
    // field, followed by a period drawn in a later field, rendered as a completely
    // different letter). Fixed by primeFontShaping() in fillTemplate. This test
    // reproduces the minimal trigger — a colon-bearing field before a period-bearing
    // one — to make sure it stays fixed.
    const template = await makeTemplateBytes(1)
    const colonField: TemplateField = { ...singleLineField, fieldId: 'colonField' }
    const periodField: TemplateField = { ...singleLineField, fieldId: 'periodField', boundingBox: { ...singleLineField.boundingBox, top: 200 } }
    const mapping: FieldMapping = {
      id: 'm1',
      templateId: 't1',
      pageNum: 1,
      fields: [colonField, periodField],
      createdAt: 0,
      updatedAt: 0,
    }

    const result = await fillTemplate(
      template,
      [mapping],
      { colonField: 'Case No: 24CV1234', periodField: 'R. Cordova' },
      FONT_BYTES,
    )

    expect(await extractPdfText(result)).toContain('R. Cordova')
  })

  it('preserves the page count and produces a re-loadable PDF', async () => {
    const template = await makeTemplateBytes(3)
    const result = await fillTemplate(template, [], {}, FONT_BYTES)
    const reloaded = await PDFDocument.load(result)
    expect(reloaded.getPageCount()).toBe(3)
  })

  it('ignores a mapping for a page number beyond the template\'s real page count', async () => {
    const template = await makeTemplateBytes(1)
    const mapping: FieldMapping = { id: 'm1', templateId: 't1', pageNum: 5, fields: [singleLineField], createdAt: 0, updatedAt: 0 }

    await expect(fillTemplate(template, [mapping], { name: 'x' }, FONT_BYTES)).resolves.toBeInstanceOf(Uint8Array)
  })
})

describe('wrapText', () => {
  let font: PDFFont

  async function getFont(): Promise<PDFFont> {
    if (!font) {
      const doc = await PDFDocument.create()
      doc.registerFontkit(fontkit)
      font = await doc.embedFont(FONT_BYTES)
    }
    return font
  }

  it('keeps short text on a single line', async () => {
    const f = await getFont()
    expect(wrapText('Hello there', 500, 12, f)).toEqual(['Hello there'])
  })

  it('breaks text that exceeds the width into multiple lines', async () => {
    const f = await getFont()
    const width = f.widthOfTextAtSize('one two', 12)
    const lines = wrapText('one two three four', width, 12, f)
    expect(lines.length).toBeGreaterThan(1)
  })

  it('never produces a line wider than the given max width', async () => {
    const f = await getFont()
    const maxWidth = 100
    const lines = wrapText('The defendant breached the agreement on multiple occasions', maxWidth, 12, f)
    for (const line of lines) {
      expect(f.widthOfTextAtSize(line, 12)).toBeLessThanOrEqual(maxWidth)
    }
  })

  it('keeps an over-long single word on its own line rather than dropping it', async () => {
    const f = await getFont()
    const lines = wrapText('Supercalifragilisticexpialidocious', 10, 12, f)
    expect(lines).toEqual(['Supercalifragilisticexpialidocious'])
  })

  it('collapses repeated whitespace between words', async () => {
    const f = await getFont()
    expect(wrapText('one   two', 500, 12, f)).toEqual(['one two'])
  })

  it('returns an empty array for empty text', async () => {
    const f = await getFont()
    expect(wrapText('', 500, 12, f)).toEqual([])
  })
})
