/**
 * Unit tests for RoiCropper's pure functions: computePersonBbox and
 * stabilizeBbox.
 *
 * Called by: Vitest test runner only — not part of the runtime pipeline.
 *
 * Pipeline role: Verifies the ROI bounding box math in isolation, covering
 * threshold behaviour, padding, clamping, and dead-zone stabilization.
 */
import { describe, it, expect } from 'vitest'
import { computePersonBbox, stabilizeBbox, BBox } from './RoiCropper'

/** Build a maskW×maskH Float32 mask with a foreground rectangle set to 1. */
function maskWithRect(
  maskW: number,
  maskH: number,
  rect: { x0: number; y0: number; x1: number; y1: number }
): Float32Array {
  const mask = new Float32Array(maskW * maskH)
  for (let y = rect.y0; y <= rect.y1; y++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      mask[y * maskW + x] = 1
    }
  }
  return mask
}

describe('computePersonBbox', () => {
  it('returns null when no pixel is above threshold', () => {
    expect(computePersonBbox(new Float32Array(100), 10, 10)).toBeNull()
  })

  it('ignores pixels at or below the 0.5 threshold', () => {
    const mask = new Float32Array(100).fill(0.5)
    expect(computePersonBbox(mask, 10, 10)).toBeNull()
  })

  it('wraps the foreground tightly then adds 5% padding, clamped to [0,1]', () => {
    // 100×100 mask, foreground occupying columns/rows 40..59 → normalised 0.4..0.6
    const mask = maskWithRect(100, 100, { x0: 40, y0: 40, x1: 59, y1: 59 })
    const bbox = computePersonBbox(mask, 100, 100) as BBox

    // raw x = 0.40, padding 0.05 → 0.35
    expect(bbox.x).toBeCloseTo(0.35, 5)
    expect(bbox.y).toBeCloseTo(0.35, 5)
    // raw width = (59-40+1)/100 = 0.20, +2*0.05 → 0.30
    expect(bbox.width).toBeCloseTo(0.3, 5)
    expect(bbox.height).toBeCloseTo(0.3, 5)
  })

  it('clamps a full-frame foreground to the unit square', () => {
    const mask = new Float32Array(100).fill(1)
    const bbox = computePersonBbox(mask, 10, 10) as BBox
    expect(bbox.x).toBe(0)
    expect(bbox.y).toBe(0)
    expect(bbox.width).toBe(1)
    expect(bbox.height).toBe(1)
  })

  it('does not let width exceed the available space to the right of x', () => {
    // Foreground hugging the right edge.
    const mask = maskWithRect(100, 100, { x0: 90, y0: 0, x1: 99, y1: 9 })
    const bbox = computePersonBbox(mask, 100, 100) as BBox
    expect(bbox.x + bbox.width).toBeLessThanOrEqual(1 + 1e-9)
  })
})

describe('stabilizeBbox', () => {
  const base: BBox = { x: 0.4, y: 0.4, width: 0.2, height: 0.2 }

  it('returns the current bbox unchanged when motion stays inside the dead zone', () => {
    // Tiny shift below DEAD_ZONE_POSITION (0.03) and DEAD_ZONE_SIZE (0.015).
    const next: BBox = { x: 0.41, y: 0.41, width: 0.205, height: 0.205 }
    expect(stabilizeBbox(base, next)).toBe(base)
  })

  it('applies 0.5 EMA smoothing when the centroid moves past the dead zone', () => {
    const next: BBox = { x: 0.6, y: 0.6, width: 0.2, height: 0.2 }
    const out = stabilizeBbox(base, next)
    // SMOOTHING = 0.5 → halfway between current and next.
    expect(out.x).toBeCloseTo(0.5, 5)
    expect(out.y).toBeCloseTo(0.5, 5)
    expect(out.width).toBeCloseTo(0.2, 5)
  })

  it('reacts to a size change past the dead zone even when the centroid is stable', () => {
    // Same centre (0.5, 0.5) but the box grows well past DEAD_ZONE_SIZE.
    const next: BBox = { x: 0.3, y: 0.3, width: 0.4, height: 0.4 }
    const out = stabilizeBbox(base, next)
    expect(out.width).toBeCloseTo(0.3, 5) // 0.5*0.2 + 0.5*0.4
    expect(out.height).toBeCloseTo(0.3, 5)
  })
})
