/**
 * A simple axis-aligned rectangular crop, in fractional image coordinates (0..1 on
 * each axis, independent of display scale or the image's actual pixel dimensions).
 *
 * Deliberately not perspective/quadrilateral correction — the plan's "edge-crop"
 * wording (written for the native ML Kit Document Scanner) implied automatic
 * perspective-corrected edge detection, a genuinely separate computer-vision feature
 * this chunk doesn't build. This is the honest version of "let the user crop out
 * background": drag the corners of a rectangle, nothing more.
 */
export interface CropRect {
  left: number
  top: number
  right: number
  bottom: number
}

export const FULL_IMAGE_CROP: CropRect = { left: 0, top: 0, right: 1, bottom: 1 }

/** Smallest allowed crop dimension, as a fraction of the image — keeps a dragged corner from inverting or collapsing the rect to a point. */
const MIN_SIZE = 0.05

export type Corner = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'

/** Moves one corner to a new fractional position, clamped to the image bounds and to preserve a minimum rect size. */
export function moveCorner(rect: CropRect, corner: Corner, x: number, y: number): CropRect {
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

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

/** Converts a fractional crop rect to integer source-pixel coordinates for a canvas drawImage() call. */
export function cropRectToPixels(rect: CropRect, naturalWidth: number, naturalHeight: number) {
  return {
    sx: Math.round(rect.left * naturalWidth),
    sy: Math.round(rect.top * naturalHeight),
    sw: Math.round((rect.right - rect.left) * naturalWidth),
    sh: Math.round((rect.bottom - rect.top) * naturalHeight),
  }
}

export function isFullImage(rect: CropRect): boolean {
  return rect.left === 0 && rect.top === 0 && rect.right === 1 && rect.bottom === 1
}
