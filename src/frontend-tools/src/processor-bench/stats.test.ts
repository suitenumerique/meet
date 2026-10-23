import { describe, expect, test } from 'vitest'
import {
  computeFps,
  mean,
  percentileOfSorted,
  summarizeIntervals,
  summarizeWindow,
} from './stats'

describe('percentileOfSorted', () => {
  test('returns the only value for a single-element sample', () => {
    expect(percentileOfSorted([42], 0.95)).toBe(42)
  })

  test('returns the median of an odd-sized sample', () => {
    expect(percentileOfSorted([1, 3, 5], 0.5)).toBe(3)
  })

  test('uses nearest-rank so p95 of 20 values is the 19th smallest', () => {
    const values = Array.from({ length: 20 }, (_, i) => i + 1)
    expect(percentileOfSorted(values, 0.95)).toBe(19)
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

describe('summarizeWindow', () => {
  test('a trailing stall shows in the p95', () => {
    // 16 frames 33 ms apart, then nothing for the rest of a 4 s window.
    const frames = Array.from({ length: 16 }, (_, i) => i * 33)

    const summary = summarizeWindow(frames, 0, 4000)!

    expect(summary.p95Ms).toBe(4000 - 15 * 33)
  })

  test('a window with no frames at all reports the whole window as one gap', () => {
    const summary = summarizeWindow([], 1000, 5000)!

    expect(summary.count).toBe(1)
    expect(summary.p95Ms).toBe(4000)
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
