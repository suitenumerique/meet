import { DEFAULT_BENCH_OPTIONS, type BenchOptions } from './types'

export type Range = { min: number; max: number }

/** The bounds the page displays, and the ones `runBenchmark` enforces. */
export const MEASURE_SECONDS: Range = { min: 3, max: 120 }
export const PASSES: Range = { min: 1, max: 6 }

const MEASURE_MS: Range = {
  min: MEASURE_SECONDS.min * 1000,
  max: MEASURE_SECONDS.max * 1000,
}

/**
 * A number input's `min`/`max` only bite on a form submit, and these controls
 * have no form: cleared, the field reads as 0. Null means unusable, and the
 * Run button stays disabled until it is not.
 */
export const numberInRange = (raw: string, range: Range): number | null => {
  const value = Number(raw)
  if (raw.trim() === '' || !Number.isInteger(value)) return null
  return value >= range.min && value <= range.max ? value : null
}

const clamp = (value: number, range: Range, fallback: number) =>
  Number.isFinite(value)
    ? Math.min(Math.max(value, range.min), range.max)
    : fallback

/**
 * Clamped, not rejected: `passes: 0` runs no pass and still returns a report,
 * and a non-finite measureMs is setTimeout(0). The report carries these, so it
 * states the protocol that actually ran.
 */
export const resolveBenchOptions = (options: BenchOptions): BenchOptions => ({
  ...options,
  measureMs: clamp(
    options.measureMs,
    MEASURE_MS,
    DEFAULT_BENCH_OPTIONS.measureMs
  ),
  passes: Math.round(
    clamp(options.passes, PASSES, DEFAULT_BENCH_OPTIONS.passes)
  ),
})
