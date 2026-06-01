/**
 * Debug logging utilities for the matting pipeline. Silent by default;
 * enabled by adding ?mattingDebug=1 to the page URL.
 *
 * Called by: AdvancedMattingProcessor, SegmenterBenchmarker.
 *
 * Pipeline role: Passive utility with no effect on the processing path.
 * Wraps console.log/warn behind the mattingDebugEnabled() gate so verbose
 * timing and benchmark logs are opt-in and never reach production users.
 */
let cached: boolean | null = null

export const mattingDebugEnabled = (): boolean => {
  if (cached !== null) return cached
  if (typeof window === 'undefined') {
    cached = false
    return cached
  }
  try {
    const params = new URL(window.location.href).searchParams
    const on = (key: string) => {
      const v = params.get(key)
      return v === '1' || v === 'true'
    }
    cached = on('mattingDebug')
  } catch {
    cached = false
  }
  return cached
}

export const debugLog = (...args: unknown[]): void => {
  if (mattingDebugEnabled()) console.log(...args)
}

export const debugWarn = (...args: unknown[]): void => {
  if (mattingDebugEnabled()) console.warn(...args)
}