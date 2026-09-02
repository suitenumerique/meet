import { computeFps, summarizeIntervals, type SampleSummary } from './stats'
import type { HeapMetrics, LongTaskMetrics } from './types'

const LONG_TASK_THRESHOLD_MS = 50

/**
 * Constant for the page's lifetime, so they are resolved once at import
 * rather than on every render and inside every summarize().
 */
export const SUPPORTS_RVFC =
  typeof HTMLVideoElement !== 'undefined' &&
  'requestVideoFrameCallback' in HTMLVideoElement.prototype

export const SUPPORTS_LONG_TASKS =
  typeof PerformanceObserver !== 'undefined' &&
  (PerformanceObserver.supportedEntryTypes ?? []).includes('longtask')

const GPU_CONTEXT_TYPES = new Set(['webgl', 'webgl2', 'webgpu'])

/** Single definition of what counts as GPU rendering, shared by every caller. */
export function rendersOnGpu(contextTypes: string[]): boolean | null {
  if (contextTypes.length === 0) return null
  return contextTypes.some((type) => GPU_CONTEXT_TYPES.has(type))
}

/**
 * Counts frames actually delivered on a processor's output track, by
 * playing it in a video element and hooking requestVideoFrameCallback.
 *
 * Observation starts immediately so the first frame can time startup;
 * interval recording only starts when `startRecording()` is called, so
 * warmup never lands in the numbers.
 */
export class FrameRateCollector {
  private readonly timestamps: number[] = []
  private active = false
  private recording = false
  private handle?: number
  private firstFrameAt: number | null = null
  private readonly firstFrameWaiters: Array<(at: number) => void> = []

  constructor(private readonly video: HTMLVideoElement) {}

  start() {
    if (this.active) return
    this.active = true
    if (SUPPORTS_RVFC) this.scheduleRvfc()
  }

  /** Allocated once, not per frame: this runs inside the measured window. */
  private readonly onFrame = (now: number) => {
    if (!this.active) return
    if (this.firstFrameAt === null) {
      this.firstFrameAt = now
      this.firstFrameWaiters.splice(0).forEach((resolve) => resolve(now))
    }
    if (this.recording) this.timestamps.push(now)
    this.scheduleRvfc()
  }

  private scheduleRvfc() {
    this.handle = this.video.requestVideoFrameCallback(this.onFrame)
  }

  /** Resolves with the timestamp of the first frame, or null if none arrives in time. */
  waitForFirstFrame(timeoutMs: number): Promise<number | null> {
    if (this.firstFrameAt !== null) return Promise.resolve(this.firstFrameAt)
    if (!SUPPORTS_RVFC) return this.pollForFirstFrame(timeoutMs)

    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs)
      this.firstFrameWaiters.push((at) => {
        clearTimeout(timer)
        resolve(at)
      })
    })
  }

  /** Fallback for browsers without rVFC: wait for the element to have decoded data. */
  private pollForFirstFrame(timeoutMs: number): Promise<number | null> {
    const deadline = performance.now() + timeoutMs
    return new Promise((resolve) => {
      const check = () => {
        if (!this.active) return resolve(null)
        if (this.video.readyState >= 2 && this.video.videoWidth > 0) {
          this.firstFrameAt = performance.now()
          return resolve(this.firstFrameAt)
        }
        if (performance.now() > deadline) return resolve(null)
        setTimeout(check, 50)
      }
      check()
    })
  }

  startRecording() {
    this.recording = true
    this.frameCountAtRecordStart = this.decodedFrameCount()
  }

  stopRecording() {
    this.recording = false
    this.frameCountAtRecordStop = this.decodedFrameCount()
  }

  stop() {
    this.active = false
    this.recording = false
    if (this.handle !== undefined) {
      this.video.cancelVideoFrameCallback?.(this.handle)
      this.handle = undefined
    }
  }

  private frameCountAtRecordStart: number | null = null
  private frameCountAtRecordStop: number | null = null

  /** Non-rVFC fallback source of truth for frame counts. */
  private decodedFrameCount(): number | null {
    const quality = this.video.getVideoPlaybackQuality?.()
    return quality ? quality.totalVideoFrames : null
  }

  summarize(measuredMs: number): {
    framesDelivered: number
    fps: number
    frameIntervals: SampleSummary | null
  } {
    if (SUPPORTS_RVFC) {
      return {
        framesDelivered: this.timestamps.length,
        fps: computeFps(this.timestamps.length, measuredMs),
        frameIntervals: summarizeIntervals(this.timestamps),
      }
    }

    const start = this.frameCountAtRecordStart
    const stop = this.frameCountAtRecordStop
    const delivered = start !== null && stop !== null ? stop - start : 0
    return {
      framesDelivered: delivered,
      fps: computeFps(delivered, measuredMs),
      frameIntervals: null,
    }
  }
}

/**
 * Independent requestAnimationFrame ticker. A processor that saturates the
 * main thread starves this loop, so its interval spread is a direct proxy
 * for how janky the rest of the app would feel.
 */
export class RafCollector {
  private readonly timestamps: number[] = []
  private active = false
  private handle: number | null = null

  start() {
    if (this.active) return
    this.active = true
    const tick = (now: number) => {
      if (!this.active) return
      this.timestamps.push(now)
      this.handle = requestAnimationFrame(tick)
    }
    this.handle = requestAnimationFrame(tick)
  }

  stop() {
    this.active = false
    if (this.handle !== null) {
      cancelAnimationFrame(this.handle)
      this.handle = null
    }
  }

  summarize(): SampleSummary | null {
    return summarizeIntervals(this.timestamps)
  }
}

/** Long tasks (>50ms) blocking the main thread during the measurement window. */
export class LongTaskCollector {
  private observer?: PerformanceObserver
  private readonly durations: number[] = []

  start() {
    if (!SUPPORTS_LONG_TASKS) return
    this.observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) this.durations.push(entry.duration)
    })
    this.observer.observe({ entryTypes: ['longtask'] })
  }

  stop() {
    this.observer?.disconnect()
    this.observer = undefined
  }

  summarize(measuredMs: number): LongTaskMetrics {
    // With no observer the durations are empty, so the arithmetic below
    // already yields zeroes; only `supported` needs stating.
    const totalMs = this.durations.reduce((sum, d) => sum + d, 0)
    const blockingMs = this.durations.reduce(
      (sum, d) => sum + Math.max(0, d - LONG_TASK_THRESHOLD_MS),
      0
    )
    return {
      supported: SUPPORTS_LONG_TASKS,
      count: this.durations.length,
      totalMs,
      blockingMs,
      sharePct: measuredMs > 0 ? (totalMs / measuredMs) * 100 : 0,
    }
  }
}

type GetContextHost = {
  prototype: { getContext: unknown }
}

/**
 * Records which canvas context types a processor creates while it runs, which
 * is the one piece of per-processor GPU evidence that is actually observable:
 * `webgl`/`webgl2` means it rendered on the GPU, `2d` means it did not.
 *
 * MediaPipe offers nothing equivalent — it never reports the delegate it
 * settled on — so inference is declared by the contender, not measured here.
 *
 * Caveat: this is a global patch for the duration of one run, so a canvas
 * created by anything else in that window is attributed to the processor.
 * Nothing else on the bench page creates canvases while a run is in flight.
 */
export class CanvasContextRecorder {
  private readonly types = new Set<string>()
  private readonly restorers: Array<() => void> = []

  start() {
    this.patch(HTMLCanvasElement as unknown as GetContextHost)
    if (typeof OffscreenCanvas !== 'undefined') {
      this.patch(OffscreenCanvas as unknown as GetContextHost)
    }
  }

  private patch(host: GetContextHost) {
    const original = host.prototype.getContext as (
      ...args: unknown[]
    ) => unknown
    const types = this.types

    host.prototype.getContext = function (this: unknown, ...args: unknown[]) {
      if (typeof args[0] === 'string') types.add(args[0])
      return original.apply(this, args)
    }

    this.restorers.push(() => {
      host.prototype.getContext = original
    })
  }

  stop() {
    this.restorers.splice(0).forEach((restore) => restore())
  }

  summarize(): string[] {
    return [...this.types].sort((a, b) => a.localeCompare(b))
  }
}

type MemoryCapablePerformance = Performance & {
  memory?: { usedJSHeapSize: number }
}

/**
 * Best-effort JS heap sampling (Chromium only, and at the mercy of GC).
 * Treat it as a smell test for leaks, not as a precise measurement.
 */
export class HeapSampler {
  private startBytes: number | null = null
  private peakBytes: number | null = null
  private endBytes: number | null = null
  private timer?: ReturnType<typeof setInterval>

  private read(): number | null {
    const memory = (performance as MemoryCapablePerformance).memory
    return memory ? memory.usedJSHeapSize : null
  }

  start() {
    this.startBytes = this.read()
    this.peakBytes = this.startBytes
    if (this.startBytes === null) return
    this.timer = setInterval(() => {
      const current = this.read()
      if (
        current !== null &&
        (this.peakBytes === null || current > this.peakBytes)
      ) {
        this.peakBytes = current
      }
    }, 500)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
    this.endBytes = this.read()
  }

  summarize(): HeapMetrics {
    return {
      supported: this.startBytes !== null,
      startBytes: this.startBytes,
      peakBytes: this.peakBytes,
      endBytes: this.endBytes,
    }
  }
}
