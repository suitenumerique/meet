import { describe, expect, it } from 'vitest'
import {
  clampCarouselRatio,
  DEFAULT_CAROUSEL_RATIO,
  getMinCarouselRatio,
  MAX_CAROUSEL_RATIO,
} from './focusLayoutSplit'

describe('getMinCarouselRatio', () => {
  it('keeps the carousel at least 200px wide', () => {
    expect(getMinCarouselRatio(1000)).toBe(0.2)
  })

  it('never exceeds the maximum ratio on narrow layouts', () => {
    expect(getMinCarouselRatio(300)).toBe(MAX_CAROUSEL_RATIO)
  })

  it('falls back to the default before the layout is measured', () => {
    expect(getMinCarouselRatio(0)).toBe(DEFAULT_CAROUSEL_RATIO)
  })
})

describe('clampCarouselRatio', () => {
  it('leaves a ratio within bounds untouched', () => {
    expect(clampCarouselRatio(0.3, 1600)).toBe(0.3)
  })

  it('raises a ratio below the minimum width', () => {
    expect(clampCarouselRatio(0.05, 1600)).toBe(0.125)
  })

  it('caps a ratio above the maximum', () => {
    expect(clampCarouselRatio(0.9, 1600)).toBe(MAX_CAROUSEL_RATIO)
  })

  it('falls back to the default for invalid values', () => {
    expect(clampCarouselRatio(NaN, 1600)).toBe(DEFAULT_CAROUSEL_RATIO)
  })
})
