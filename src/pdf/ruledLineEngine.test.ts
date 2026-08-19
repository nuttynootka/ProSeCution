import { readFileSync } from 'node:fs'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, type PDFFont } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { layoutRuledLines, wrapText } from './ruledLineEngine'

const FONT_BYTES = new Uint8Array(readFileSync('public/fonts/ibm-plex-mono-400.woff2'))

async function getFont(): Promise<PDFFont> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  return doc.embedFont(FONT_BYTES)
}

describe('wrapText', () => {
  it('keeps short text on a single line', async () => {
    const font = await getFont()
    expect(wrapText('Hello there', 500, 12, font)).toEqual(['Hello there'])
  })

  it('never produces a line wider than the given max width', async () => {
    const font = await getFont()
    const maxWidth = 100
    const lines = wrapText('The defendant breached the agreement on multiple occasions', maxWidth, 12, font)
    for (const line of lines) {
      expect(font.widthOfTextAtSize(line, 12)).toBeLessThanOrEqual(maxWidth)
    }
  })
})

describe('layoutRuledLines', () => {
  it('uses the ceiling font size when the text already fits within maxLines at that size', async () => {
    const font = await getFont()
    const layout = layoutRuledLines('Short text', font, { width: 300, maxLines: 3, lineHeight: 16 })

    expect(layout.truncated).toBe(false)
    expect(layout.lines).toEqual(['Short text'])
    expect(layout.fontSize).toBeCloseTo(Math.min(12, 16 * 0.7), 5)
  })

  it('shrinks the font size until text that would overflow maxLines at the ceiling actually fits', async () => {
    const font = await getFont()
    const longText = 'The defendant breached the agreement on multiple occasions during the relevant period'
    const ceiling = Math.min(12, 16 * 0.7)

    const atCeiling = wrapText(longText, 146, ceiling, font)
    expect(atCeiling.length).toBeGreaterThan(3) // confirms this text really would overflow without shrinking

    const layout = layoutRuledLines(longText, font, { width: 146, maxLines: 3, lineHeight: 16 })

    expect(layout.truncated).toBe(false)
    expect(layout.lines.length).toBeLessThanOrEqual(3)
    expect(layout.fontSize).toBeLessThan(ceiling)
    expect(layout.lines.join(' ')).toContain('relevant')
    expect(layout.lines.join(' ')).toContain('period')
  })

  it('truncates at the floor font size, and says so, when the text cannot fit at any allowed size', async () => {
    const font = await getFont()
    const veryLongText =
      'The defendant breached the agreement on multiple separate occasions during the relevant period, causing substantial and ongoing financial harm to the plaintiff that has not yet been remedied in any way whatsoever despite repeated good faith attempts at informal resolution'

    const layout = layoutRuledLines(veryLongText, font, { width: 146, maxLines: 3, lineHeight: 16, minFontSize: 7 })

    expect(layout.truncated).toBe(true)
    expect(layout.fontSize).toBeCloseTo(7, 5)
    expect(layout.lines).toHaveLength(3)
    expect(layout.lines.join(' ')).not.toContain('whatsoever')
  })

  it('never returns a font size below the given floor, even when nothing fits', async () => {
    const font = await getFont()
    const layout = layoutRuledLines('word '.repeat(200), font, { width: 50, maxLines: 1, lineHeight: 16, minFontSize: 6 })

    expect(layout.fontSize).toBeGreaterThanOrEqual(6)
  })

  it('never returns a font size above lineHeight * 0.7, even when a larger maxFontSize is requested', async () => {
    const font = await getFont()
    const layout = layoutRuledLines('x', font, { width: 300, maxLines: 3, lineHeight: 10, maxFontSize: 40 })

    expect(layout.fontSize).toBeCloseTo(10 * 0.7, 5)
  })
})
