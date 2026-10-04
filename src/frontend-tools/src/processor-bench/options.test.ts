import { describe, expect, test } from 'vitest'
import {
  MEASURE_SECONDS,
  PASSES,
  numberInRange,
  resolveBenchOptions,
} from './options'
import { DEFAULT_BENCH_OPTIONS } from './types'

describe('numberInRange', () => {
  test('accepts an integer inside the range', () => {
    expect(numberInRange('15', MEASURE_SECONDS)).toBe(15)
  })

  test('rejects an empty field rather than reading it as 0', () => {
    expect(numberInRange('', PASSES)).toBeNull()
  })

  test('rejects values outside the range', () => {
    expect(numberInRange('0', PASSES)).toBeNull()
    expect(numberInRange('7', PASSES)).toBeNull()
  })

  test('rejects non-integers and unparseable text', () => {
    expect(numberInRange('2.5', PASSES)).toBeNull()
    expect(numberInRange('abc', PASSES)).toBeNull()
  })
})

describe('resolveBenchOptions', () => {
  test('leaves options that are already in range untouched', () => {
    expect(resolveBenchOptions(DEFAULT_BENCH_OPTIONS)).toEqual(
      DEFAULT_BENCH_OPTIONS
    )
  })

  test('clamps a pass count that would run nothing at all', () => {
    expect(
      resolveBenchOptions({ ...DEFAULT_BENCH_OPTIONS, passes: 0 }).passes
    ).toBe(PASSES.min)
  })

  test('clamps a measurement window that is too short to measure', () => {
    expect(
      resolveBenchOptions({ ...DEFAULT_BENCH_OPTIONS, measureMs: 0 }).measureMs
    ).toBe(MEASURE_SECONDS.min * 1000)
  })

  test('falls back to the defaults for non-finite input', () => {
    const resolved = resolveBenchOptions({
      ...DEFAULT_BENCH_OPTIONS,
      measureMs: Number.NaN,
      passes: Number.POSITIVE_INFINITY,
    })
    expect(resolved.measureMs).toBe(DEFAULT_BENCH_OPTIONS.measureMs)
    expect(resolved.passes).toBe(DEFAULT_BENCH_OPTIONS.passes)
  })
})
