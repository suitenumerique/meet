/**
 * Tracks new video frames via requestVideoFrameCallback (rVFC) and exposes
 * a promise-based "wait for next frame" API used to pace the segmenter loop.
 *
 * Called by: AdvancedMattingProcessor._launch(), SegmenterLoopRunner,
 * RenderLoopRunner.
 *
 * Pipeline role: Shared timing source for both loops. The segmenter loop
 * awaits waitNextFrame() so inference only starts when a genuinely new camera
 * frame has arrived. The render loop reads videoFrameSeq to skip render calls
 * when no new frame is available. Falls back gracefully to timer-based
 * polling on browsers that do not support rVFC.
 */
export interface VideoFrameMeta {
  captureTime: number
  presentationTime: number
  mediaTime: number
  receivedAt: number
}

export class VideoFrameTracker {
  private videoElement?: HTMLVideoElement
  private _rvfcHandle: number | null = null
  private _videoFrameSeq = 0
  private _latestVideoFrameMeta?: VideoFrameMeta
  private _frameAwaiter: {
    promise: Promise<void>
    resolve: () => void
  } | null = null
  private _onTick?: () => void

  get videoFrameSeq(): number {
    return this._videoFrameSeq
  }

  get latestVideoFrameMeta(): VideoFrameMeta | undefined {
    return this._latestVideoFrameMeta
  }

  start(videoElement: HTMLVideoElement, onTick?: () => void) {
    this.videoElement = videoElement
    this._onTick = onTick
    this._videoFrameSeq = 0
    this._latestVideoFrameMeta = undefined
    this._startVideoFrameMetaTracking()
  }

  stop() {
    this._stopVideoFrameMetaTracking()
    this.videoElement = undefined
    this._onTick = undefined
  }

  /**
   * Promise resolved by the next rVFC tick. The segmenter loop awaits this to
   * align with the camera's native cadence instead of polling on a timer.
   * Multiple ticks between two awaits collapse into a single wake.
   */
  waitNextFrame(): Promise<void> {
    if (!this._frameAwaiter) {
      let resolve!: () => void
      const promise = new Promise<void>((r) => {
        resolve = r
      })
      this._frameAwaiter = { promise, resolve }
    }
    return this._frameAwaiter.promise
  }

  private _startVideoFrameMetaTracking(): void {
    const video = this.videoElement
    if (!video) return
    const anyVideo = video as unknown as {
      requestVideoFrameCallback?: (
        cb: (
          now: number,
          meta: {
            captureTime?: number
            presentationTime: number
            mediaTime: number
            expectedDisplayTime?: number
          }
        ) => void
      ) => number
      cancelVideoFrameCallback?: (handle: number) => void
    }
    if (typeof anyVideo.requestVideoFrameCallback !== 'function') return
    const tick = (
      now: number,
      meta: {
        captureTime?: number
        presentationTime: number
        mediaTime: number
      }
    ) => {
      if (!this.videoElement) return
      this._latestVideoFrameMeta = {
        captureTime:
          typeof meta.captureTime === 'number' ? meta.captureTime : now,
        presentationTime: meta.presentationTime,
        mediaTime: meta.mediaTime,
        receivedAt: performance.now(),
      }
      this._videoFrameSeq++
      this._onTick?.()
      if (this._frameAwaiter) {
        const a = this._frameAwaiter
        this._frameAwaiter = null
        a.resolve()
      }
      this._rvfcHandle = anyVideo.requestVideoFrameCallback!(tick)
    }
    this._rvfcHandle = anyVideo.requestVideoFrameCallback(tick)
  }

  private _stopVideoFrameMetaTracking(): void {
    const video = this.videoElement
    if (!video || this._rvfcHandle === null) return
    const anyVideo = video as unknown as {
      cancelVideoFrameCallback?: (handle: number) => void
    }
    try {
      anyVideo.cancelVideoFrameCallback?.(this._rvfcHandle)
    } catch {
      /* best-effort */
    }
    this._rvfcHandle = null
    this._latestVideoFrameMeta = undefined
    if (this._frameAwaiter) {
      const a = this._frameAwaiter
      this._frameAwaiter = null
      a.resolve()
    }
  }
}
