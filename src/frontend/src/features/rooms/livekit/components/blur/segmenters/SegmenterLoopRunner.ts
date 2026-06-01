/**
 * Async segmenter loop — the inference half of the two-loop engine.
 *
 * Called by: AdvancedMattingProcessor._initRunners() (construction) and
 * _launch() (start/stop).
 *
 * Pipeline role: Runs an async while-loop paced by VideoFrameTracker.
 * Each iteration captures a video snapshot, optionally crops via
 * PreProcessingPipeline, runs the segmenter, then calls onPairProduced
 * with the resulting {mask, source, timing} pair. Decoupled from the render
 * loop: segmentation speed and rendering speed are independent; the render
 * loop always reads the latest pair without blocking on inference.
 */
import { Segmenter } from './Segmenter'
import { PreProcessingPipeline } from '../preprocessing/PreProcessingPipeline'
import { MattingCanvasManager } from '../preprocessing/MattingCanvasManager'
import { VideoFrameTracker } from '../preprocessing/VideoFrameTracker'

export interface FrameMaskPair {
  mask: Float32Array
  source: ImageBitmap
  captureTime: number
  cameraCaptureTime: number
  procW: number
  procH: number
}

export class SegmenterLoopRunner {
  private videoElement?: HTMLVideoElement
  private _segLoopActive = false
  private _lastInferenceSeq = -1

  constructor(
    private getSegmenter: () => Segmenter | undefined,
    private getPreProcessingPipeline: () => PreProcessingPipeline | undefined,
    private getCanvasManager: () => MattingCanvasManager,
    private getFrameTracker: () => VideoFrameTracker,
    private getSegmenterFrameSkip: () => number,
    private getProcessingDimensions: () => { w: number; h: number },
    private onPairProduced: (pair: FrameMaskPair) => void
  ) {}

  start(videoElement: HTMLVideoElement) {
    this.videoElement = videoElement
    this._segLoopActive = true
    this._lastInferenceSeq = -1
    this._runSegmenterLoop() // fire-and-forget
  }

  stop() {
    this._segLoopActive = false
    this.videoElement = undefined
  }

  private async _runSegmenterLoop(): Promise<void> {
    const FALLBACK_MS = 1000 / 60
    const tracker = this.getFrameTracker()

    while (this._segLoopActive) {
      const hasRvfc = tracker.latestVideoFrameMeta !== undefined

      if (hasRvfc) {
        await tracker.waitNextFrame()
        if (!this._segLoopActive) return
        const seq = tracker.videoFrameSeq
        if (seq - this._lastInferenceSeq < this.getSegmenterFrameSkip()) continue
        this._lastInferenceSeq = seq
      }

      const t0 = performance.now()
      const seg = this.getSegmenter()
      if (!seg || !this.videoElement || this.videoElement.videoWidth === 0) {
        await new Promise<void>((r) => setTimeout(r, FALLBACK_MS))
        continue
      }

      let capturedSource: ImageBitmap | null = null
      try {
        const canvasManager = this.getCanvasManager()
        const snapshot = canvasManager.captureSnapshot(this.videoElement)
        if (!snapshot) {
          await new Promise<void>((r) => setTimeout(r, FALLBACK_MS))
          continue
        }

        const cameraCaptureTime = tracker.latestVideoFrameMeta?.captureTime ?? t0
        const prePipeline = this.getPreProcessingPipeline()

        const motionRgba = prePipeline
          ? (canvasManager.getMotionFrameRgba() ?? undefined)
          : undefined

        const cropBbox = prePipeline?.getNextCropBbox(
          motionRgba,
          MattingCanvasManager.MOTION_W,
          MattingCanvasManager.MOTION_H
        ) ?? null

        const dims = this.getProcessingDimensions()
        const sourceImageData = canvasManager.sizeSource(
          snapshot,
          dims.w,
          dims.h,
          cropBbox
        )

        capturedSource = await createImageBitmap(snapshot, {
          imageOrientation: 'flipY',
        })

        if (!this._segLoopActive) {
          capturedSource.close()
          return
        }

        const inferStart = performance.now()
        const rawMask = await seg.segment(sourceImageData, inferStart)

        if (!this._segLoopActive) {
          capturedSource.close()
          return
        }

        if (this.getSegmenter() === seg) {
          const mask = prePipeline
            ? prePipeline.applyAfterInference(
                rawMask,
                dims.w,
                dims.h,
                cropBbox
              )
            : rawMask

          this.onPairProduced({
            mask,
            source: capturedSource,
            captureTime: t0,
            cameraCaptureTime,
            procW: dims.w,
            procH: dims.h,
          })
          capturedSource = null // ownership transferred

        } else {
          capturedSource.close()
          capturedSource = null
        }
      } catch (e) {
        if (capturedSource) {
          try {
            capturedSource.close()
          } catch {
            /* ImageBitmap.close() — best-effort */
          }
          capturedSource = null
        }
        if (!this._segLoopActive) return
        console.error('[AMP] segmenter loop error', e)
        console.warn('[matting:SEGMENTER_TIMEOUT_PASSTHROUGH]', e instanceof Error ? `${e.name}: ${e.message}` : String(e))
        await new Promise<void>((r) => setTimeout(r, 100))
        continue
      }

      if (!hasRvfc) {
        const elapsed = performance.now() - t0
        await new Promise<void>((r) =>
          setTimeout(r, Math.max(0, FALLBACK_MS - elapsed))
        )
      }
    }
  }
}
