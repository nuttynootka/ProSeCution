import { describe, expect, it } from 'vitest'
import { cropRectToPixels, FULL_IMAGE_CROP, isFullImage, moveCorner } from './cropMath'

describe('moveCorner', () => {
  it('moves the requested corner to the given fractional position', () => {
    const moved = moveCorner(FULL_IMAGE_CROP, 'topLeft', 0.2, 0.3)
    expect(moved).toEqual({ left: 0.2, top: 0.3, right: 1, bottom: 1 })
  })

  it('clamps positions outside the 0..1 range', () => {
    expect(moveCorner(FULL_IMAGE_CROP, 'topLeft', -0.5, 1.5)).toEqual({
      left: 0,
      top: 1 - 0.05, // clamped further by the min-size rule below
      right: 1,
      bottom: 1,
    })
  })

  it('never lets a corner cross past the minimum size, preventing an inverted rect', () => {
    const tiny = { left: 0.4, top: 0.4, right: 0.5, bottom: 0.5 }
    const moved = moveCorner(tiny, 'topLeft', 0.9, 0.9) // tries to drag past the opposite corner
    expect(moved.left).toBeLessThan(moved.right)
    expect(moved.top).toBeLessThan(moved.bottom)
    expect(moved.right - moved.left).toBeGreaterThanOrEqual(0.05 - 1e-9)
  })

  it('moving one corner does not affect the opposite corner', () => {
    const moved = moveCorner(FULL_IMAGE_CROP, 'bottomRight', 0.6, 0.7)
    expect(moved.left).toBe(0)
    expect(moved.top).toBe(0)
    expect(moved.right).toBe(0.6)
    expect(moved.bottom).toBe(0.7)
  })
})

describe('cropRectToPixels', () => {
  it('converts a fractional rect to integer pixel coordinates for the given image size', () => {
    const rect = { left: 0.1, top: 0.2, right: 0.9, bottom: 0.8 }
    expect(cropRectToPixels(rect, 1000, 500)).toEqual({ sx: 100, sy: 100, sw: 800, sh: 300 })
  })

  it('the full-image crop covers the entire image', () => {
    expect(cropRectToPixels(FULL_IMAGE_CROP, 640, 480)).toEqual({ sx: 0, sy: 0, sw: 640, sh: 480 })
  })
})

describe('isFullImage', () => {
  it('is true for the untouched default crop', () => {
    expect(isFullImage(FULL_IMAGE_CROP)).toBe(true)
  })

  it('is false once any corner has moved', () => {
    expect(isFullImage(moveCorner(FULL_IMAGE_CROP, 'topLeft', 0.1, 0))).toBe(false)
  })
})
