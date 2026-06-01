/**
 * Render loop — the compositing half of the two-loop engine.
 *
 * Called by: AdvancedMattingProcessor._initRunners() (construction) and
 * _launch() (start/stop).
 *
 * Pipeline role: Runs a requestAnimationFrame loop that fires on every display
 * refresh. Each tick reads the latest FrameMaskPair from AdvancedMattingProcessor,
 * uploads the mask to GpuRenderer, then calls GpuRenderer.render() to write the
 * composited frame to the output canvas. Before the first pair arrives it renders
 * in passthrough mode (all-ones mask) so the raw camera feed is always visible.
 * Decoupled from the segmenter loop: rendering runs at display framerate
 * regardless of inference speed.
 */
import { GpuRenderer } from './GpuRenderer'
import { VideoFrameTracker } from '../preprocessing/VideoFrameTracker'
import { FrameMaskPair } from '../segmenters/SegmenterLoopRunner'

export class RenderLoopRunner {
  private videoElement?: HTMLVideoElement
  private _renderLoopActive = false
  private _renderLoopHandle: number | null = null
  private _lastRenderedSeq = -1
  private _lastVideoTime = -1

  constructor(
    private getGpuRenderer: () => GpuRenderer | undefined,
    private getFrameTracker: () => VideoFrameTracker,
    private getLatestPair: () => FrameMaskPair | null,
    private getPassthroughMask: (w: number, h: number) => Float32Array,
    private getProcessingDimensions: () => { w: number; h: number }
  ) {}

  start(videoElement: HTMLVideoElement) {
    this.videoElement = videoElement
    this._renderLoopActive = true
    this._lastRenderedSeq = -1
    this._lastVideoTime = -1
    this._scheduleRender()
  }

  stop() {
    this._renderLoopActive = false
    this._cancelRender()
    this.videoElement = undefined
  }

  private _scheduleRender(): void {
    if (!this._renderLoopActive) return
    const tracker = this.getFrameTracker()

    this._renderLoopHandle = requestAnimationFrame(() => {
      const hasRvfc = tracker.latestVideoFrameMeta !== undefined
      if (hasRvfc) {
        const seq = tracker.videoFrameSeq
        if (seq > this._lastRenderedSeq) {
          this._lastRenderedSeq = seq
          this._renderFrame()
        }
      } else {
        if (this.videoElement) {
          const t = this.videoElement.currentTime
          if (t !== this._lastVideoTime) {
            this._lastVideoTime = t
            this._renderFrame()
          }
        }
      }
      this._scheduleRender()
    })
  }

  private _cancelRender(): void {
    if (this._renderLoopHandle === null) return
    cancelAnimationFrame(this._renderLoopHandle)
    this._renderLoopHandle = null
  }

  private _renderFrame(): void {
    const gpuRenderer = this.getGpuRenderer()
    if (!gpuRenderer || !this.videoElement || this.videoElement.videoWidth === 0) {
      return
    }

    const pair = this.getLatestPair()
    if (!pair) {
      const vw = this.videoElement.videoWidth
      const vh = this.videoElement.videoHeight
      if (vw !== gpuRenderer.outW || vh !== gpuRenderer.outH) {
        gpuRenderer.resizeOutput(vw, vh)
      }
      this._drawPassthrough()
      return
    }

    gpuRenderer.uploadMask(pair.mask, pair.procW, pair.procH)

    const sw = pair.source.width
    const sh = pair.source.height
    if (sw !== gpuRenderer.outW || sh !== gpuRenderer.outH) {
      gpuRenderer.resizeOutput(sw, sh)
    }
    gpuRenderer.render(pair.source)
  }

  private _drawPassthrough() {
    const gpuRenderer = this.getGpuRenderer()
    if (!gpuRenderer || !this.videoElement) return
    const dims = this.getProcessingDimensions()
    const passthrough = this.getPassthroughMask(dims.w, dims.h)
    gpuRenderer.uploadMask(passthrough, dims.w, dims.h)
    gpuRenderer.render(this.videoElement)
  }
}
