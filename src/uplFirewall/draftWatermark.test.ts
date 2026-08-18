import { readFileSync } from 'node:fs'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { DEFAULT_DRAFT_WATERMARK_TEXT, stampDraftWatermark } from './draftWatermark'

const FONT_BYTES = new Uint8Array(readFileSync('public/fonts/ibm-plex-mono-400.woff2'))

async function makeTwoPagePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(FONT_BYTES)
  const page1 = doc.addPage([612, 792])
  page1.drawText('PAGE ONE MARKER', { x: 50, y: 700, size: 14, font })
  const page2 = doc.addPage([612, 792])
  page2.drawText('PAGE TWO MARKER', { x: 50, y: 700, size: 14, font })
  return doc.save()
}

async function extractPdfText(bytes: Uint8Array, pageNum: number): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise
  const page = await doc.getPage(pageNum)
  const content = await page.getTextContent()
  const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ')
  await doc.destroy()
  return text.replace(/\s+/g, ' ').trim()
}

describe('stampDraftWatermark', () => {
  it('produces a real, re-loadable PDF', async () => {
    const source = await makeTwoPagePdf()
    const stamped = await stampDraftWatermark(source, FONT_BYTES)
    expect(Buffer.from(stamped.slice(0, 5)).toString('latin1')).toBe('%PDF-')
    const reloaded = await PDFDocument.load(stamped)
    expect(reloaded.getPageCount()).toBe(2)
  })

  it('stamps the complete default watermark text onto every page, start to end', async () => {
    // Regression test for a real, empirically-confirmed bug: an earlier version
    // centered the rotated text using its *unrotated* width, which for this long a
    // phrase pushed part of it off the page — and pdf.js silently drops characters
    // from a text run that extends past the page bounds, truncating both the start
    // ("WORKING") and the end ("LITIGANT") of the exact same string. Checking both
    // ends specifically, not just a middle substring, is what catches that.
    const source = await makeTwoPagePdf()
    const stamped = await stampDraftWatermark(source, FONT_BYTES)
    const page1Text = await extractPdfText(stamped, 1)
    const page2Text = await extractPdfText(stamped, 2)
    for (const text of [page1Text, page2Text]) {
      expect(text).toContain('WORKING')
      expect(text).toContain('DRAFT')
      expect(text).toContain('SELF-REPRESENTED')
      expect(text).toContain('LITIGANT')
    }
  })

  it('leaves the original content on each page intact alongside the watermark', async () => {
    const source = await makeTwoPagePdf()
    const stamped = await stampDraftWatermark(source, FONT_BYTES)
    expect(await extractPdfText(stamped, 1)).toContain('PAGE ONE MARKER')
    expect(await extractPdfText(stamped, 2)).toContain('PAGE TWO MARKER')
  })

  it('accepts a custom watermark text', async () => {
    const source = await makeTwoPagePdf()
    const stamped = await stampDraftWatermark(source, FONT_BYTES, 'CUSTOM DRAFT LABEL')
    expect(await extractPdfText(stamped, 1)).toContain('CUSTOM DRAFT LABEL')
    expect(await extractPdfText(stamped, 1)).not.toContain(DEFAULT_DRAFT_WATERMARK_TEXT)
  })
})
