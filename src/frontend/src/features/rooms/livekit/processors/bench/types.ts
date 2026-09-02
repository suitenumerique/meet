import type { Track, TrackProcessor } from 'livekit-client'
import type { SampleSummary } from './stats'
import type { SystemSpecs } from './systemSpecs'

/**
 * What a processor asks MediaPipe for. It is a *request*, not a measurement:
 * MediaPipe never reports the delegate it settled on and can silently fall
 * back to CPU, so this is only ever labelled as requested.
 */
export type InferenceDelegate = 'CPU' | 'GPU' | 'unknown'

/**
 * Everything the harness needs from a processor. Deliberately the plain
 * livekit-client interface: the harness must stay usable for background
 * blur, face filters, or anything else that transforms a video track.
 */
export type VideoTrackProcessor = TrackProcessor<Track.Kind>

export type BenchContender = {
  id: string
  label: string
  description?: string
  create: () => VideoTrackProcessor
  /** The MediaPipe delegate this processor requests, where it is known. */
  inferenceDelegate: InferenceDelegate
  /**
   * Optional note read after init, for whatever the processor decided at
   * runtime (model picked, GPU vs CPU path). Surfaced next to the numbers
   * so two rows are only compared when they are comparable.
   */
  describe?: (processor: VideoTrackProcessor) => string | undefined
}

export type GpuUsage = {
  /** Canvas context types the processor created — observed, not declared. */
  contextTypes: string[]
  /** True when a webgl/webgl2/webgpu context was created; null if none were. */
  rendersOnGpu: boolean | null
  /** What the processor asked MediaPipe for; never what it actually used. */
  requestedInferenceDelegate: InferenceDelegate
}

export type BenchOptions = {
  width: number
  height: number
  frameRate: number
  /** Settling time after the first frame, before measurement starts. */
  warmupMs: number
  measureMs: number
  cooldownMs: number
  /** Passes over the contender list; pass 2+ runs in reverse order. */
  passes: number
  deviceId?: string
}

export const DEFAULT_BENCH_OPTIONS: BenchOptions = {
  width: 1280,
  height: 720,
  frameRate: 30,
  warmupMs: 3000,
  measureMs: 15000,
  cooldownMs: 2000,
  passes: 2,
}

export type LongTaskMetrics = {
  supported: boolean
  count: number
  /** Raw sum of long-task durations. */
  totalMs: number
  /** Total Blocking Time: each long task's excess over the 50ms threshold. */
  blockingMs: number
  /** Share of the measurement window spent inside long tasks. */
  sharePct: number
}

export type HeapMetrics = {
  supported: boolean
  startBytes: number | null
  peakBytes: number | null
  endBytes: number | null
}

export type RunMetrics = {
  pass: number
  measuredMs: number
  framesDelivered: number
  fps: number
  /** Null when the browser lacks requestVideoFrameCallback. */
  frameIntervals: SampleSummary | null
  rafIntervals: SampleSummary | null
  longTasks: LongTaskMetrics
  heap: HeapMetrics
  gpu: GpuUsage
  /** init() until the first frame leaves the processor. */
  startupMs: number | null
  note?: string
  error?: string
}

export type ContenderResult = {
  contenderId: string
  label: string
  runs: RunMetrics[]
  /** First run: model download and compile included. */
  coldStartupMs: number | null
  /** Later runs: assets already cached. */
  warmStartupMs: number | null
  averaged: {
    fps: number | null
    frameP95Ms: number | null
    rafP50Ms: number | null
    rafP95Ms: number | null
    blockingMs: number | null
    longTaskCount: number | null
    longTaskSharePct: number | null
  }
  notes: string[]
  errors: string[]
  gpu: GpuUsage
}

export type BenchReport = {
  startedAt: string
  userAgent: string
  specs: SystemSpecs
  options: BenchOptions
  sourceSettings: MediaTrackSettings | null
  results: ContenderResult[]
}

export type BenchProgress = {
  phase: 'idle' | 'starting' | 'warmup' | 'measuring' | 'cooldown' | 'done'
  contenderLabel?: string
  pass?: number
  totalPasses?: number
  message?: string
}
