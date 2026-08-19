import type { PDFFont } from 'pdf-lib'

const DEFAULT_MAX_FONT_SIZE = 12
const DEFAULT_MIN_FONT_SIZE = 7
const FONT_SIZE_STEP = 0.5

/** Greedy word wrap using the font's own measured width — a fixed characters-per-line guess would be wrong for any non-monospace font and every font size this scales with. */
export function wrapText(text: string, maxWidth: number, fontSize: number, font: PDFFont): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (current === '' || font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate
    } else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}

export interface RuledLineLayoutOptions {
  width: number
  maxLines: number
  lineHeight: number
  maxFontSize?: number
  minFontSize?: number
}

export interface RuledLineLayout {
  fontSize: number
  lines: string[]
  /** True only when even the smallest allowed font size still couldn't fit every wrapped line within maxLines — `lines` is truncated at maxLines in that case. The caller (PdfFillService) is responsible for surfacing this rather than letting content disappear silently. */
  truncated: boolean
}

/**
 * The ruled-line paragraph engine (Chunk 45): instead of always drawing a
 * MULTI_LINE_RULED field at one fixed font size and silently dropping whatever
 * doesn't fit within maxLines (the original Chunk 19 behavior), this searches
 * downward from a real ceiling to a real floor for the largest size whose
 * word-wrapped line count actually fits — the same "shrink until it fits, but not
 * forever" approach `stampDraftWatermark`'s `fitFontSize` (Chunk 25) already uses
 * for a different field. Only when nothing in that range fits does it fall back to
 * the floor size and truncate, and says so via `truncated`.
 */
export function layoutRuledLines(text: string, font: PDFFont, options: RuledLineLayoutOptions): RuledLineLayout {
  const ceiling = Math.min(options.maxFontSize ?? DEFAULT_MAX_FONT_SIZE, options.lineHeight * 0.7)
  const floor = Math.min(options.minFontSize ?? DEFAULT_MIN_FONT_SIZE, ceiling)

  for (let size = ceiling; size >= floor; size -= FONT_SIZE_STEP) {
    const lines = wrapText(text, options.width, size, font)
    if (lines.length <= options.maxLines) {
      return { fontSize: size, lines, truncated: false }
    }
  }

  const lines = wrapText(text, options.width, floor, font).slice(0, options.maxLines)
  return { fontSize: floor, lines, truncated: true }
}
