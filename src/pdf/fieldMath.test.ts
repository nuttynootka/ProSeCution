import { describe, expect, it } from 'vitest'
import {
  boundingBoxToFractional,
  defaultFieldRect,
  fractionalToBoundingBox,
  moveCorner,
  translateRect,
} from './fieldMath'

describe('moveCorner', () => {
  const rect = { left: 0.2, top: 0.2, right: 0.6, bottom: 0.5 }

  it('moves the dragged corner and leaves the opposite one fixed', () => {
    const moved = moveCorner(rect, 'bottomRight', 0.8, 0.9)
    expect(moved).toEqual({ left: 0.2, top: 0.2, right: 0.8, bottom: 0.9 })
  })

  it('clamps to the page bounds', () => {
    const moved = moveCorner(rect, 'topLeft', -0.5, -0.5)
    expect(moved.left).toBe(0)
    expect(moved.top).toBe(0)
  })

  it('never lets a corner invert past the minimum size', () => {
    const moved = moveCorner(rect, 'topLeft', 0.99, 0.99)
    expect(moved.right - moved.left).toBeGreaterThan(0)
    expect(moved.bottom - moved.top).toBeGreaterThan(0)
  })
})

describe('translateRect', () => {
  it('shifts the box by the given delta, preserving its size', () => {
    const rect = { left: 0.1, top: 0.1, right: 0.3, bottom: 0.2 }
    const moved = translateRect(rect, 0.1, 0.05)
    expect(moved.left).toBeCloseTo(0.2)
    expect(moved.top).toBeCloseTo(0.15)
    expect(moved.right).toBeCloseTo(0.4)
    expect(moved.bottom).toBeCloseTo(0.25)
  })

  it('clamps so the box never drags past the right/bottom edge', () => {
    const rect = { left: 0.8, top: 0.8, right: 0.95, bottom: 0.9 }
    const moved = translateRect(rect, 0.5, 0.5)
    expect(moved.right).toBeLessThanOrEqual(1)
    expect(moved.bottom).toBeLessThanOrEqual(1)
    // Size preserved even when clamped.
    expect(moved.right - moved.left).toBeCloseTo(0.15)
    expect(moved.bottom - moved.top).toBeCloseTo(0.1)
  })

  it('clamps so the box never drags past the left/top edge', () => {
    const rect = { left: 0.05, top: 0.05, right: 0.2, bottom: 0.15 }
    const moved = translateRect(rect, -0.5, -0.5)
    expect(moved.left).toBe(0)
    expect(moved.top).toBe(0)
  })
})

describe('defaultFieldRect', () => {
  it('centers a default-size box on the tap point', () => {
    const rect = defaultFieldRect(0.5, 0.5)
    expect((rect.left + rect.right) / 2).toBeCloseTo(0.5)
    expect((rect.top + rect.bottom) / 2).toBeCloseTo(0.5)
  })

  it('clamps so the box stays fully on the page when tapped near an edge', () => {
    const rect = defaultFieldRect(0.01, 0.01)
    expect(rect.left).toBeGreaterThanOrEqual(0)
    expect(rect.top).toBeGreaterThanOrEqual(0)
    expect(rect.right).toBeLessThanOrEqual(1)
    expect(rect.bottom).toBeLessThanOrEqual(1)
  })

  it('clamps near the opposite edge too', () => {
    const rect = defaultFieldRect(0.99, 0.99)
    expect(rect.right).toBeLessThanOrEqual(1)
    expect(rect.bottom).toBeLessThanOrEqual(1)
  })
})

describe('fractional <-> BoundingBox conversion', () => {
  const pageWidth = 612
  const pageHeight = 792

  it('round-trips a box through fractional and back to the same points', () => {
    const original = { left: 72, top: 100, width: 200, height: 20 }
    const fractional = boundingBoxToFractional(original, pageWidth, pageHeight)
    const back = fractionalToBoundingBox(fractional, pageWidth, pageHeight)

    expect(back.left).toBeCloseTo(original.left)
    expect(back.top).toBeCloseTo(original.top)
    expect(back.width).toBeCloseTo(original.width)
    expect(back.height).toBeCloseTo(original.height)
  })

  it('converts a full-page box to the unit rect', () => {
    const fractional = boundingBoxToFractional({ left: 0, top: 0, width: pageWidth, height: pageHeight }, pageWidth, pageHeight)
    expect(fractional).toEqual({ left: 0, top: 0, right: 1, bottom: 1 })
  })
})
