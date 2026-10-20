export type SampleSummary = {
  count: number
  meanMs: number
  p50Ms: number
  p95Ms: number
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/**
 * Nearest-rank percentile of an ascending, non-empty sample: the smallest
 * value at or below which at least `p` of it falls. No interpolation, so
 * every result is a value that was actually observed.
 */
export function percentileOfSorted(sorted: number[], p: number): number {
  const rank = Math.ceil(p * sorted.length)
  const index = Math.min(Math.max(rank - 1, 0), sorted.length - 1)
  return sorted[index]
}

/** Turns a series of monotonic timestamps into a summary of the gaps between them. */
export function summarizeIntervals(timestamps: number[]): SampleSummary | null {
  if (timestamps.length < 2) return null

  const intervals: number[] = []
  for (let i = 1; i < timestamps.length; i++) {
    intervals.push(timestamps[i] - timestamps[i - 1])
  }

  // Sorted once and indexed twice: a run can hold a few thousand intervals.
  const sorted = [...intervals].sort((a, b) => a - b)

  return {
    count: intervals.length,
    meanMs: mean(intervals)!,
    p50Ms: percentileOfSorted(sorted, 0.5),
    p95Ms: percentileOfSorted(sorted, 0.95),
  }
}

/**
 * Gaps between events inside a measurement window, counting the window's own
 * edges: the wait before the first event and after the last are gaps too.
 * Without them a stream that stalls for the rest of the window, or never
 * delivers at all, reports only the healthy gaps it had before.
 */
export function summarizeWindow(
  timestamps: number[],
  startMs: number,
  endMs: number
): SampleSummary | null {
  return summarizeIntervals([startMs, ...timestamps, endMs])
}

export function computeFps(frameCount: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0
  return (frameCount * 1000) / elapsedMs
}
