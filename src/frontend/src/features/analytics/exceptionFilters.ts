import type { CaptureResult } from 'posthog-js'

const IGNORED_EXCEPTION_PATTERNS = [
  /ResizeObserver loop (completed with undelivered notifications|limit exceeded)/,
]

const shouldIgnoreException = (value: unknown): boolean =>
  typeof value === 'string' &&
  IGNORED_EXCEPTION_PATTERNS.some((pattern) => pattern.test(value))

export const filterExceptions = (
  event: CaptureResult | null
): CaptureResult | null => {
  if (event?.event !== '$exception') return event

  const exceptionList = event.properties?.['$exception_list']
  const values: unknown[] = Array.isArray(exceptionList)
    ? exceptionList.map((exception) => exception?.value)
    : []

  values.push(event.properties?.['$exception_message'])

  return values.some(shouldIgnoreException) ? null : event
}
