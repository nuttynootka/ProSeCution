import type { BoundingBox } from './types'

/**
 * A field's box while it's being edited, in fractional canvas coordinates (0..1 on
 * each axis) — the same convention CropEditor (Chunk 8) uses for the same reason:
 * independent of the canvas's actual rendered size or scale, so drag math doesn't
 * need to know pixel dimensions.
 */
export interface FractionalRect {
  left: number
  top: number
  right: number
  bottom: number
}

const MIN_SIZE = 0.02

export type Corner = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'

/** Moves one corner to a new fractional position, clamped to the page bounds and to preserve a minimum box size. Same shape as CropEditor's moveCorner (Chunk 8) — a field box being resized has exactly the same constraints a crop rect does. */
export function moveCorner(rect: FractionalRect, corner: Corner, x: number, y: number): FractionalRect {
  const cx = clamp01(x)
  const cy = clamp01(y)
  switch (corner) {
    case 'topLeft':
      return { ...rect, left: Math.min(cx, rect.right - MIN_SIZE), top: Math.min(cy, rect.bottom - MIN_SIZE) }
    case 'topRight':
      return { ...rect, right: Math.max(cx, rect.left + MIN_SIZE), top: Math.min(cy, rect.bottom - MIN_SIZE) }
    case 'bottomLeft':
      return { ...rect, left: Math.min(cx, rect.right - MIN_SIZE), bottom: Math.max(cy, rect.top + MIN_SIZE) }
    case 'bottomRight':
      return { ...rect, right: Math.max(cx, rect.left + MIN_SIZE), bottom: Math.max(cy, rect.top + MIN_SIZE) }
  }
}

/** Moves the whole box by a fractional delta, clamped so it never drags past the page edge — preserves width/height exactly, unlike moveCorner. */
export function translateRect(rect: FractionalRect, dx: number, dy: number): FractionalRect {
  const width = rect.right - rect.left
  const height = rect.bottom - rect.top
  const left = clamp(rect.left + dx, 0, 1 - width)
  const top = clamp(rect.top + dy, 0, 1 - height)
  return { left, top, right: left + width, bottom: top + height }
}

const DEFAULT_WIDTH = 0.3
const DEFAULT_HEIGHT = 0.035

/** A new field's starting box, centered on where the user tapped, clamped to stay fully on the page. */
export function defaultFieldRect(centerX: number, centerY: number): FractionalRect {
  const left = clamp(centerX - DEFAULT_WIDTH / 2, 0, 1 - DEFAULT_WIDTH)
  const top = clamp(centerY - DEFAULT_HEIGHT / 2, 0, 1 - DEFAULT_HEIGHT)
  return { left, top, right: left + DEFAULT_WIDTH, bottom: top + DEFAULT_HEIGHT }
}

function clamp01(n: number): number {
  return clamp(n, 0, 1)
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function boundingBoxToFractional(box: BoundingBox, pageWidth: number, pageHeight: number): FractionalRect {
  return {
    left: box.left / pageWidth,
    top: box.top / pageHeight,
    right: (box.left + box.width) / pageWidth,
    bottom: (box.top + box.height) / pageHeight,
  }
}

export function fractionalToBoundingBox(rect: FractionalRect, pageWidth: number, pageHeight: number): BoundingBox {
  return {
    left: rect.left * pageWidth,
    top: rect.top * pageHeight,
    width: (rect.right - rect.left) * pageWidth,
    height: (rect.bottom - rect.top) * pageHeight,
  }
}
