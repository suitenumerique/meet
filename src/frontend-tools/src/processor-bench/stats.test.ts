import { describe, expect, test } from 'vitest'
import { computeFps, mean, percentile, summarizeIntervals } from './stats'

describe('percentile', () => {
  test('returns the only value for a single-element sample', () => {
    expect(percentile([42], 0.95)).toBe(42)
  })

  test('returns the median of an odd-sized sample', () => {
    expect(percentile([5, 1, 3], 0.5)).toBe(3)
  })

  test('uses nearest-rank so p95 of 20 values is the 19th smallest', () => {
    const values = Array.from({ length: 20 }, (_, i) => i + 1)
    expect(percentile(values, 0.95)).toBe(19)
  })

  test('does not mutate the caller array', () => {
    const values = [3, 1, 2]
    percentile(values, 0.5)
    expect(values).toEqual([3, 1, 2])
  })

  test('returns null for an empty sample', () => {
    expect(percentile([], 0.5)).toBeNull()
  })
})

describe('mean', () => {
  test('averages the values', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5)
  })

  test('returns null for an empty sample', () => {
    expect(mean([])).toBeNull()
  })
})

describe('summarizeIntervals', () => {
  test('summarizes the gaps between timestamps, not the timestamps', () => {
    const summary = summarizeIntervals([0, 10, 20, 30, 40])

    expect(summary).not.toBeNull()
    expect(summary!.count).toBe(4)
    expect(summary!.meanMs).toBe(10)
    expect(summary!.p50Ms).toBe(10)
  })

  test('surfaces stalls in the p95 while the p50 stays healthy', () => {
    // 18 healthy 16ms gaps plus 2 stalls, so the stalls occupy the top 10%
    // of samples and a nearest-rank p95 lands on one of them.
    const gaps = [...Array(18).fill(16), 500, 500]
    const timestamps = gaps.reduce(
      (acc, gap) => [...acc, acc[acc.length - 1] + gap],
      [0]
    )

    const summary = summarizeIntervals(timestamps)!

    expect(summary.count).toBe(20)
    expect(summary.p50Ms).toBe(16)
    expect(summary.p95Ms).toBe(500)
  })

  test('returns null when there are fewer than two timestamps', () => {
    expect(summarizeIntervals([5])).toBeNull()
    expect(summarizeIntervals([])).toBeNull()
  })
})

describe('computeFps', () => {
  test('converts a frame count over an elapsed window into frames per second', () => {
    expect(computeFps(30, 1000)).toBe(30)
    expect(computeFps(45, 1500)).toBe(30)
  })

  test('returns 0 rather than dividing by zero on an empty window', () => {
    expect(computeFps(10, 0)).toBe(0)
  })
})
