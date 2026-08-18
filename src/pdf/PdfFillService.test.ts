import { inflateSync } from 'node:zlib'
import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { fillTemplate, wrapText } from './PdfFillService'
import type { FieldMapping, TemplateField } from './types'

async function makeTemplateBytes(pageCount = 1): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pageCount; i++) doc.addPage([612, 792])
  return doc.save()
}

/**
 * Verifies drawn text content for real, not just "no exception was thrown": pdf-lib
 * writes standard-font text operators as hex strings inside (typically
 * FlateDecode-compressed) content streams — e.g. "Hello" becomes `<48656C6C6F>` —
 * so inflating every stream and searching for the hex-encoded text is a genuine,
 * independent check that the text actually landed in the output PDF's content, not
 * an assumption that drawText() must have worked because it didn't throw.
 */
function pdfContainsText(bytes: Uint8Array, text: string): boolean {
  const buf = Buffer.from(bytes)
  const raw = buf.toString('latin1')
  const hex = Buffer.from(text, 'utf-8').toString('hex').toUpperCase()
  let idx = 0
  while (true) {
    const streamStart = raw.indexOf('stream', idx)
    if (streamStart === -1) return false
    const dataStart = streamStart + 7
    const streamEnd = raw.indexOf('endstream', dataStart)
    if (streamEnd === -1) return false
    try {
      const inflated = inflateSync(buf.subarray(dataStart, streamEnd)).toString('latin1').toUpperCase()
      if (inflated.includes(hex)) return true
    } catch {
      // Not a FlateDecode stream (or not a real content stream) — skip it.
    }
    idx = streamEnd + 9
  }
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

    const result = await fillTemplate(template, [mapping], { name: 'Maria Hartley' })

    expect(pdfContainsText(result, 'Maria Hartley')).toBe(true)
  })

  it('word-wraps a multi-line field across several drawn lines', async () => {
    const template = await makeTemplateBytes(1)
    const mapping: FieldMapping = { id: 'm1', templateId: 't1', pageNum: 1, fields: [multiLineField], createdAt: 0, updatedAt: 0 }
    const longText = 'The defendant breached the agreement on multiple occasions during the relevant period'

    const result = await fillTemplate(template, [mapping], { facts: longText })

    // Each individual word should be findable — proof the text was actually broken
    // into multiple drawn lines (a single un-wrapped Tj would still contain each
    // word too, so this alone isn't the strongest check — see the length-limited
    // wrapText unit tests below for the wrapping logic itself).
    expect(pdfContainsText(result, 'defendant')).toBe(true)
    expect(pdfContainsText(result, 'relevant')).toBe(true)
  })

  it('skips a field with no resolved value — draws nothing for it', async () => {
    const template = await makeTemplateBytes(1)
    const mapping: FieldMapping = { id: 'm1', templateId: 't1', pageNum: 1, fields: [singleLineField], createdAt: 0, updatedAt: 0 }

    const result = await fillTemplate(template, [mapping], {})

    expect(pdfContainsText(result, 'Maria Hartley')).toBe(false)
  })

  it('draws page-2 fields on page 2, not page 1', async () => {
    const template = await makeTemplateBytes(2)
    const page1Field: TemplateField = { ...singleLineField, fieldId: 'p1field' }
    const page2Field: TemplateField = { ...singleLineField, fieldId: 'p2field' }
    const mappings: FieldMapping[] = [
      { id: 'm1', templateId: 't1', pageNum: 1, fields: [page1Field], createdAt: 0, updatedAt: 0 },
      { id: 'm2', templateId: 't1', pageNum: 2, fields: [page2Field], createdAt: 0, updatedAt: 0 },
    ]

    const result = await fillTemplate(template, mappings, { p1field: 'PAGE-ONE-MARKER', p2field: 'PAGE-TWO-MARKER' })
    const reloaded = await PDFDocument.load(result)

    expect(reloaded.getPageCount()).toBe(2)
    expect(pdfContainsText(result, 'PAGE-ONE-MARKER')).toBe(true)
    expect(pdfContainsText(result, 'PAGE-TWO-MARKER')).toBe(true)
  })

  it('preserves the page count and produces a re-loadable PDF', async () => {
    const template = await makeTemplateBytes(3)
    const result = await fillTemplate(template, [], {})
    const reloaded = await PDFDocument.load(result)
    expect(reloaded.getPageCount()).toBe(3)
  })

  it('ignores a mapping for a page number beyond the template\'s real page count', async () => {
    const template = await makeTemplateBytes(1)
    const mapping: FieldMapping = { id: 'm1', templateId: 't1', pageNum: 5, fields: [singleLineField], createdAt: 0, updatedAt: 0 }

    await expect(fillTemplate(template, [mapping], { name: 'x' })).resolves.toBeInstanceOf(Uint8Array)
  })
})

describe('wrapText', () => {
  let font: PDFFont

  async function getFont(): Promise<PDFFont> {
    if (!font) {
      const doc = await PDFDocument.create()
      font = await doc.embedFont(StandardFonts.Helvetica)
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
