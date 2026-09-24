import type { CaptureResult } from 'posthog-js'

const IGNORED_EXCEPTION_PATTERNS = [
  /ResizeObserver loop (completed with undelivered notifications|limit exceeded)/,
  // livekit-client leaks the raw WebSocket error Event as an unhandled
  // rejection when the signal ws errors after connect (Firefox-heavy,
  // coincides with signal reconnects). Carries zero diagnostic content —
  // the close reason is already logged by the SDK.
  // See: https://github.com/livekit/client-sdk-js/issues/2062
  /^Event captured as exception with keys: isTrusted$/,
  // MediaPipe's WASM writes its native logs to stderr, which Emscripten
  // routes to console.error, which PostHog's console capture then promotes
  // to an $exception — even though nothing was thrown. Two flavors:
  //
  // 1. "INFO: ..." lines are purely informational. In particular
  //    "INFO: Created TensorFlow Lite XNNPACK delegate for CPU." is a
  //    SUCCESS message: TFLite prints it when it lazily initializes CPU
  //    inference on the first segmented frame. It fires on every effects
  //    init, on every browser and delegate (the GPU delegate still
  //    instantiates the CPU/XNNPACK delegate for non-delegated ops), so it
  //    was our single noisiest "error" while carrying zero signal.
  /^INFO: /,
  //
  // 2. absl-formatted log lines, e.g.
  //    "E0901 19:21:45.443000 1880752 gl_graph_runner_internal.cc:260]
  //     StartGraph failed: ..."
  //    (severity letter E/W/I/F + MMDD + timestamp). These are the stderr
  //    *copies* of failures that MediaPipe also raises as real JS
  //    exceptions, which we already capture via reportError / thrown
  //    errors. Dropping them de-duplicates each incident (previously
  //    counted 2-3x) without losing the actual error report.
  /^[EWIF]\d{4} \d{2}:\d{2}:\d{2}\./,
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
