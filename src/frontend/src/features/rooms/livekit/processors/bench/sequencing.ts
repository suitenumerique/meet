export class BenchAbortError extends Error {
  constructor() {
    super('Benchmark aborted')
    this.name = 'BenchAbortError'
  }
}

type InitThenAttachSteps = {
  init: () => Promise<void>
  attach: () => void
  play: () => Promise<void>
}

/**
 * Drives a processor's start-up in the order livekit's `setProcessor` uses:
 * `init()` runs against an element that has no source yet, and only then is
 * the track attached and played.
 *
 * The order is a contract, not a detail. Processors finish `init()` by
 * registering an `onloadeddata` handler to start their render loop; attach
 * the source first and that event fires before anyone is listening, so the
 * loop never starts and the processor emits nothing but a black frame.
 */
export async function initThenAttach(
  steps: InitThenAttachSteps
): Promise<void> {
  await steps.init()
  steps.attach()
  await steps.play()
}

/**
 * Rejects as soon as `signal` aborts, whether or not `promise` ever settles.
 *
 * Needed because a processor's `init()` exposes no cancellation, so the only
 * way to stay responsive to Stop is to give up waiting on it.
 */
export function raceAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined
): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(new BenchAbortError())

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new BenchAbortError())
    signal.addEventListener('abort', onAbort, { once: true })

    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      }
    )
  })
}

/** Throws if the run has been aborted; use at phase boundaries. */
export function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) throw new BenchAbortError()
}
