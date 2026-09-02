import { Track } from 'livekit-client'
import {
  CanvasContextRecorder,
  FrameRateCollector,
  HeapSampler,
  LongTaskCollector,
  RafCollector,
} from './collectors'
import {
  BenchAbortError,
  initThenAttach,
  raceAbort,
  throwIfAborted,
} from './sequencing'
import { mean } from './stats'
import { collectSystemSpecs } from './systemSpecs'
import type {
  BenchContender,
  BenchOptions,
  BenchProgress,
  BenchReport,
  ContenderResult,
  GpuUsage,
  RunMetrics,
  VideoTrackProcessor,
} from './types'

export { BenchAbortError } from './sequencing'

const FIRST_FRAME_TIMEOUT_MS = 20_000
const READY_TIMEOUT_MS = 20_000

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new BenchAbortError())
    const onAbort = () => {
      clearTimeout(timer)
      reject(new BenchAbortError())
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ])
}

/** Processors may expose readiness; the interface does not require it. */
function waitForReadyIfSupported(
  processor: VideoTrackProcessor
): Promise<unknown> {
  const maybe = processor as { waitForReady?: () => Promise<void> }
  if (typeof maybe.waitForReady !== 'function') return Promise.resolve(null)
  return withTimeout(maybe.waitForReady(), READY_TIMEOUT_MS)
}

async function playSilently(video: HTMLVideoElement) {
  try {
    await video.play()
  } catch {
    // Autoplay of a muted MediaStream is allowed; a rejection here is not fatal.
  }
}

export type BenchMounts = {
  sourceContainer: HTMLElement
  outputContainer: HTMLElement
  videoClassName?: string
}

/**
 * A fresh element per run, like livekit's setProcessor. Reusing one across
 * contenders would carry `loadeddata` state from the previous run into the
 * next processor's start-up.
 */
function createVideoElement(
  container: HTMLElement,
  className?: string
): HTMLVideoElement {
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  if (className) video.className = className
  container.replaceChildren(video)
  return video
}

type RunContext = {
  sourceTrack: MediaStreamTrack
  mounts: BenchMounts
  options: BenchOptions
  signal?: AbortSignal
  onProgress: (progress: BenchProgress) => void
}

async function runSingle(
  contender: BenchContender,
  pass: number,
  ctx: RunContext
): Promise<RunMetrics> {
  const { mounts, options, signal, onProgress } = ctx
  const label = contender.label

  // A fresh clone per run: the modern processor path consumes the track it is
  // handed, so contenders must never share one.
  const sourceClone = ctx.sourceTrack.clone()
  const sourceVideo = createVideoElement(
    mounts.sourceContainer,
    mounts.videoClassName
  )
  const outputVideo = createVideoElement(
    mounts.outputContainer,
    mounts.videoClassName
  )

  let processor: VideoTrackProcessor | undefined
  const frames = new FrameRateCollector(outputVideo)
  const raf = new RafCollector()
  const longTasks = new LongTaskCollector()
  const heap = new HeapSampler()
  const contexts = new CanvasContextRecorder()

  const gpuUsage = (): GpuUsage => ({
    ...contexts.summarize(),
    requestedInferenceDelegate: contender.inferenceDelegate,
  })

  const failed = (error: string): RunMetrics => ({
    pass,
    measuredMs: 0,
    framesDelivered: 0,
    fps: 0,
    frameIntervals: null,
    rafIntervals: null,
    longTasks: longTasks.summarize(0),
    heap: heap.summarize(),
    gpu: gpuUsage(),
    startupMs: null,
    error,
  })

  try {
    onProgress({ phase: 'starting', contenderLabel: label, pass })
    throwIfAborted(signal)

    // Started before construction: processors create their canvases in the
    // constructor or in init(), and both count as evidence.
    contexts.start()
    processor = contender.create()
    const initStartedAt = performance.now()

    // Order matters: see initThenAttach.
    await initThenAttach({
      init: () =>
        raceAbort(
          processor!.init({
            kind: Track.Kind.Video,
            track: sourceClone,
            element: sourceVideo,
          }),
          signal
        ),
      attach: () => {
        sourceVideo.srcObject = new MediaStream([sourceClone])
      },
      play: () => playSilently(sourceVideo),
    })

    const processedTrack = processor.processedTrack
    if (!processedTrack) return failed('Processor produced no processedTrack')

    outputVideo.srcObject = new MediaStream([processedTrack])
    await playSilently(outputVideo)

    frames.start()
    const firstFrameAt = await raceAbort(
      frames.waitForFirstFrame(FIRST_FRAME_TIMEOUT_MS),
      signal
    )
    if (firstFrameAt === null) {
      return failed(
        `No frame was delivered on the processed track within ${FIRST_FRAME_TIMEOUT_MS / 1000}s`
      )
    }
    const startupMs = firstFrameAt - initStartedAt

    onProgress({ phase: 'warmup', contenderLabel: label, pass })
    await raceAbort(waitForReadyIfSupported(processor), signal)
    await delay(options.warmupMs, signal)

    onProgress({ phase: 'measuring', contenderLabel: label, pass })
    raf.start()
    longTasks.start()
    heap.start()
    frames.startRecording()
    const measureStartedAt = performance.now()

    await delay(options.measureMs, signal)

    const measuredMs = performance.now() - measureStartedAt
    frames.stopRecording()
    raf.stop()
    longTasks.stop()
    heap.stop()

    const frameStats = frames.summarize(measuredMs)

    return {
      pass,
      measuredMs,
      framesDelivered: frameStats.framesDelivered,
      fps: frameStats.fps,
      frameIntervals: frameStats.frameIntervals,
      rafIntervals: raf.summarize(),
      longTasks: longTasks.summarize(measuredMs),
      heap: heap.summarize(),
      gpu: gpuUsage(),
      startupMs,
      note: contender.describe?.(processor),
    }
  } catch (error) {
    if (error instanceof BenchAbortError) throw error
    return failed(
      error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    )
  } finally {
    frames.stop()
    raf.stop()
    longTasks.stop()
    heap.stop()
    contexts.stop()
    try {
      await processor?.destroy()
    } catch {
      // A processor that fails to tear down must not mask the run's result.
    }
    sourceClone.stop()
    sourceVideo.srcObject = null
    outputVideo.srcObject = null
    sourceVideo.remove()
    outputVideo.remove()
  }
}

function averageOf(values: Array<number | null | undefined>): number | null {
  const usable = values.filter(
    (value): value is number => typeof value === 'number'
  )
  return mean(usable)
}

function aggregate(
  contender: BenchContender,
  runs: RunMetrics[]
): ContenderResult {
  const good = runs.filter((run) => !run.error)
  const ordered = [...runs].sort((a, b) => a.pass - b.pass)
  const timed = ordered.filter((run) => run.startupMs !== null)

  return {
    contenderId: contender.id,
    label: contender.label,
    runs: ordered,
    coldStartupMs: timed[0]?.startupMs ?? null,
    warmStartupMs: timed[1]?.startupMs ?? null,
    averaged: {
      fps: averageOf(good.map((run) => run.fps)),
      frameP95Ms: averageOf(good.map((run) => run.frameIntervals?.p95Ms)),
      rafP50Ms: averageOf(good.map((run) => run.rafIntervals?.p50Ms)),
      rafP95Ms: averageOf(good.map((run) => run.rafIntervals?.p95Ms)),
      blockingMs: averageOf(good.map((run) => run.longTasks.blockingMs)),
      longTaskCount: averageOf(good.map((run) => run.longTasks.count)),
      longTaskSharePct: averageOf(good.map((run) => run.longTasks.sharePct)),
    },
    notes: [
      ...new Set(runs.map((run) => run.note).filter((n): n is string => !!n)),
    ],
    errors: [
      ...new Set(runs.map((run) => run.error).filter((e): e is string => !!e)),
    ],
    gpu: mergeGpuUsage(contender, runs),
  }
}

/** Union across passes: a context seen in any run was genuinely created. */
function mergeGpuUsage(
  contender: BenchContender,
  runs: RunMetrics[]
): GpuUsage {
  const contextTypes = [
    ...new Set(runs.flatMap((run) => run.gpu.contextTypes)),
  ].sort()
  const observed = runs
    .map((run) => run.gpu.rendersOnGpu)
    .filter((value): value is boolean => value !== null)

  return {
    contextTypes,
    rendersOnGpu: observed.length === 0 ? null : observed.some(Boolean),
    requestedInferenceDelegate: contender.inferenceDelegate,
  }
}

export async function acquireSourceTrack(
  options: BenchOptions
): Promise<MediaStreamTrack> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: options.width },
      height: { ideal: options.height },
      frameRate: { ideal: options.frameRate },
      ...(options.deviceId ? { deviceId: { exact: options.deviceId } } : {}),
    },
  })
  const [track] = stream.getVideoTracks()
  if (!track) throw new Error('getUserMedia returned no video track')
  return track
}

/**
 * Runs every contender against one camera track under an identical protocol.
 *
 * Passes alternate direction (forward, then reversed) so that thermal drift
 * and model-cache warmth do not systematically favour whoever ran first.
 */
export async function runBenchmark(
  contenders: BenchContender[],
  options: BenchOptions,
  mounts: BenchMounts,
  onProgress: (progress: BenchProgress) => void,
  signal?: AbortSignal
): Promise<BenchReport> {
  if (contenders.length === 0)
    throw new Error('Select at least one processor to benchmark')

  const specs = await collectSystemSpecs()
  const sourceTrack = await acquireSourceTrack(options)
  const sourceSettings = sourceTrack.getSettings()
  const runsByContender = new Map<string, RunMetrics[]>(
    contenders.map((contender) => [contender.id, []])
  )

  try {
    for (let pass = 0; pass < options.passes; pass++) {
      const order = pass % 2 === 0 ? contenders : [...contenders].reverse()
      for (const contender of order) {
        throwIfAborted(signal)
        const metrics = await runSingle(contender, pass, {
          sourceTrack,
          mounts,
          options,
          signal,
          onProgress,
        })
        runsByContender.get(contender.id)!.push(metrics)

        onProgress({ phase: 'cooldown', contenderLabel: contender.label, pass })
        await delay(options.cooldownMs, signal)
      }
    }
  } finally {
    sourceTrack.stop()
  }

  onProgress({ phase: 'done' })

  return {
    startedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    specs,
    options,
    sourceSettings,
    results: contenders.map((contender) =>
      aggregate(contender, runsByContender.get(contender.id)!)
    ),
  }
}
