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
 * Nearest-rank percentile: the smallest value at or below which at least
 * `p` of the sample falls. No interpolation, so every result is a value
 * that was actually observed.
 */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
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

  return {
    count: intervals.length,
    meanMs: mean(intervals)!,
    p50Ms: percentile(intervals, 0.5)!,
    p95Ms: percentile(intervals, 0.95)!,
  }
}

export function computeFps(frameCount: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0
  return (frameCount * 1000) / elapsedMs
}
