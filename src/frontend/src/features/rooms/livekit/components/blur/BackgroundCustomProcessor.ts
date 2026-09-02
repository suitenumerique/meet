import type { ProcessorOptions, Track } from 'livekit-client'
import {
  FilesetResolver,
  ImageSegmenter,
  ImageSegmenterResult,
} from '@mediapipe/tasks-vision'
import {
  CLEAR_TIMEOUT,
  SET_TIMEOUT,
  TIMEOUT_TICK,
  timerWorkerScript,
} from './TimerWorker'
import {
  BackgroundProcessorInterface,
  SELFIE_SEGMENTER_MODEL_PATH,
  type ProcessorConfig,
  type ProcessorType,
  MEDIAPIPE_PATH_WASM,
} from '.'
import { captureEvent, reportError } from '@/features/analytics/telemetry'

const PROCESSING_WIDTH = 256
const PROCESSING_HEIGHT = 144

const SEGMENTATION_MASK_CANVAS_ID = 'background-blur-local-segmentation'
const BLUR_CANVAS_ID = 'background-blur-local'

const DEFAULT_BLUR = '10'
const FRAME_INTERVAL_MS = 1000 / 30

// After this many consecutive failed frames, stop segmenting and fall back to
// passing the raw video through, so the user keeps a live camera instead of a
// frozen frame.
const MAX_CONSECUTIVE_ERRORS = 5

let webgl2Supported: boolean | undefined

/**
 * MediaPipe's ImageSegmenter requires a WebGL2 context on the web even with
 * `delegate: 'CPU'` (only inference runs on CPU; the mask post-processing in
 * TensorsToSegmentationCalculator is GL-based). Without this check, machines
 * with WebGL disabled or blocklisted fail at StartGraph with
 * `emscripten_webgl_create_context() returned error 0`.
 *
 * The result is cached and the probe context is explicitly released so that
 * repeated support checks do not count against the browser's limit on live
 * WebGL contexts.
 */
const isWebGL2Supported = () => {
  if (webgl2Supported === undefined) {
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl2')
      webgl2Supported = !!gl
      gl?.getExtension('WEBGL_lose_context')?.loseContext()
    } catch {
      webgl2Supported = false
    }
  }
  return webgl2Supported
}

/**
 * This implementation of video blurring is made to be run on CPU for browser that are
 * not compatible with track-processor-js.
 *
 * It also make possible to run blurring on browser that does not implement MediaStreamTrackGenerator and
 * MediaStreamTrackProcessor.
 */
export class BackgroundCustomProcessor implements BackgroundProcessorInterface {
  options: ProcessorConfig
  name: string
  processedTrack?: MediaStreamTrack | undefined

  source?: MediaStreamTrack
  sourceSettings?: MediaTrackSettings
  videoElement?: HTMLVideoElement

  // Canvas containing the video processing result, of which we extract as stream.
  outputCanvas?: HTMLCanvasElement
  outputCanvasCtx?: CanvasRenderingContext2D

  imageSegmenter?: ImageSegmenter

  // Canvas used for resizing video source and projecting mask.
  segmentationMaskCanvas?: HTMLCanvasElement
  segmentationMaskCanvasCtx?: CanvasRenderingContext2D

  // Mask containing the inference result.
  segmentationMask?: ImageData

  // The resized image of the video source.
  sourceImageData?: ImageData

  timerWorker?: Worker

  type: ProcessorType
  virtualBackgroundImage?: HTMLImageElement

  private virtualBackgroundImagePath?: string
  private destroyed = false
  private passthrough = false
  private consecutiveErrors = 0
  private processing?: Promise<void>
  private onVideoLoaded?: () => void

  constructor(opts: ProcessorConfig) {
    this.name = 'blur'
    this.options = opts
    this.type = opts.type
  }

  static get isSupported() {
    return (
      navigator.userAgent.toLowerCase().includes('firefox') &&
      isWebGL2Supported()
    )
  }

  async init(opts: ProcessorOptions<Track.Kind>) {
    if (!opts.element) {
      throw new Error('Element is required for processing')
    }

    this.destroyed = false
    this.passthrough = false
    this.consecutiveErrors = 0

    this.source = opts.track as MediaStreamTrack
    this.sourceSettings = this.source!.getSettings()
    this.videoElement = opts.element as HTMLVideoElement

    this._initVirtualBackgroundImage()
    this._createMainCanvas()
    this._createMaskCanvas()

    const stream = this.outputCanvas!.captureStream()
    const tracks = stream.getVideoTracks()
    if (tracks.length == 0) {
      throw new Error('No tracks found for processing')
    }
    this.processedTrack = tracks[0]

    this.segmentationMask = new ImageData(PROCESSING_WIDTH, PROCESSING_HEIGHT)

    const t0 = performance.now()
    await this.initSegmenter()
    const segmenterInitMs = Math.round(performance.now() - t0)

    this._initWorker()

    captureEvent('legacy-background-processor', {
      effect_type: this.options.type,
      hw_concurrency: navigator.hardwareConcurrency,
      video_width: this.videoElement?.videoWidth,
      video_height: this.videoElement?.videoHeight,
      segmenter_init_ms: segmenterInitMs,
    })
  }

  _initVirtualBackgroundImage() {
    if (this.options.type !== 'virtual' || !this.options.imagePath) {
      return
    }

    if (
      this.virtualBackgroundImage &&
      this.virtualBackgroundImagePath === this.options.imagePath
    ) {
      return
    }

    const image = document.createElement('img')
    image.crossOrigin = 'anonymous'
    image.src = this.options.imagePath
    // Surface load failures once instead of letting drawImage throw on a
    // broken image inside the processing loop.
    image.decode().catch((error) => {
      reportError('effects_processor_failure', error, {
        context: 'Failed to load virtual background image',
        image_path:
          this.options.type === 'virtual' ? this.options.imagePath : undefined,
      })
    })
    this.virtualBackgroundImage = image
    this.virtualBackgroundImagePath = this.options.imagePath
  }

  _isVirtualBackgroundImageReady() {
    return (
      !!this.virtualBackgroundImage &&
      this.virtualBackgroundImage.complete &&
      this.virtualBackgroundImage.naturalWidth > 0
    )
  }

  async update(opts: ProcessorConfig): Promise<void> {
    this.options = opts
    this._initVirtualBackgroundImage()
  }

  _initWorker() {
    this.timerWorker = new Worker(timerWorkerScript, {
      name: 'Blurring',
    })
    this.timerWorker.onmessage = (data) => this.onTimerMessage(data)

    const startLoop = () => {
      this.onVideoLoaded = undefined
      this._syncOutputCanvasSize()
      this._scheduleNextFrame()
    }

    // When re-initializing with an element that already has data (e.g. after
    // hiding then showing the camera), 'loadeddata' will not fire again, so
    // rely on readyState instead of a stale boolean flag.
    if (this.videoElement!.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      startLoop()
    } else {
      this.onVideoLoaded = startLoop
      this.videoElement!.addEventListener('loadeddata', this.onVideoLoaded, {
        once: true,
      })
    }
  }

  onTimerMessage(response: { data: { id: number } }) {
    if (response.data.id === TIMEOUT_TICK) {
      this.processing = this.process()
    }
  }

  async initSegmenter() {
    const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_PATH_WASM)
    this.imageSegmenter = await ImageSegmenter.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: SELFIE_SEGMENTER_MODEL_PATH,
        delegate: 'CPU', // Use CPU for Firefox.
      },
      runningMode: 'VIDEO',
      outputCategoryMask: true,
      outputConfidenceMasks: false,
    })
  }

  /**
   * Resize the source video to the processing resolution.
   */
  async sizeSource() {
    this.segmentationMaskCanvasCtx?.drawImage(
      this.videoElement!,
      0,
      0,
      this.videoElement!.videoWidth,
      this.videoElement!.videoHeight,
      0,
      0,
      PROCESSING_WIDTH,
      PROCESSING_HEIGHT
    )

    this.sourceImageData = this.segmentationMaskCanvasCtx?.getImageData(
      0,
      0,
      PROCESSING_WIDTH,
      PROCESSING_HEIGHT
    )
  }

  /**
   * Run the segmentation.
   */
  async segment() {
    const startTimeMs = performance.now()
    return new Promise<void>((resolve, reject) => {
      try {
        this.imageSegmenter!.segmentForVideo(
          this.sourceImageData!,
          startTimeMs,
          (result: ImageSegmenterResult) => {
            try {
              // The mask is only valid for the duration of this callback:
              // MediaPipe frees the underlying WASM memory as soon as it
              // returns, so the data must be copied out synchronously here.
              this._applyMaskToAlphaChannel(result)
              resolve()
            } catch (error) {
              reject(error)
            }
          }
        )
      } catch (error) {
        reject(error)
      }
    })
  }

  _applyMaskToAlphaChannel(result: ImageSegmenterResult) {
    const categoryMask = result.categoryMask
    if (!categoryMask) {
      return
    }
    const mask = categoryMask.getAsUint8Array()
    const alpha = this.segmentationMask!.data
    const length = Math.min(mask.length, alpha.length / 4)
    for (let i = 0; i < length; ++i) {
      alpha[i * 4 + 3] = 255 - mask[i]
    }
  }

  /**
   * Composite the segmentation mask over the output canvas: mask first, then
   * the clear body, leaving the background to be filled by the caller.
   */
  _compositeMaskAndBody() {
    this.segmentationMaskCanvasCtx!.putImageData(this.segmentationMask!, 0, 0)

    this.outputCanvasCtx!.globalCompositeOperation = 'copy'
    this.outputCanvasCtx!.filter = 'blur(8px)'

    // Put opacity mask.
    this.outputCanvasCtx!.drawImage(
      this.segmentationMaskCanvas!,
      0,
      0,
      PROCESSING_WIDTH,
      PROCESSING_HEIGHT,
      0,
      0,
      this.videoElement!.videoWidth,
      this.videoElement!.videoHeight
    )

    // Draw clear body.
    this.outputCanvasCtx!.globalCompositeOperation = 'source-in'
    this.outputCanvasCtx!.filter = 'none'
    this.outputCanvasCtx!.drawImage(this.videoElement!, 0, 0)
  }

  /**
   * TODO: future improvement with WebGL.
   */
  async blur() {
    if (this.options.type !== 'blur') {
      throw new Error('Blurring is only supported for blur background')
    }
    this._compositeMaskAndBody()

    // Draw blurry background.
    this.outputCanvasCtx!.globalCompositeOperation = 'destination-over'
    this.outputCanvasCtx!.filter = `blur(${this.options.blurRadius ?? DEFAULT_BLUR}px)`
    this.outputCanvasCtx!.drawImage(this.videoElement!, 0, 0)
  }

  /**
   * TODO: future improvement with WebGL.
   */
  async drawVirtualBackground() {
    this._compositeMaskAndBody()

    this.outputCanvasCtx!.globalCompositeOperation = 'destination-over'
    this.outputCanvasCtx!.filter = 'none'
    if (this._isVirtualBackgroundImageReady()) {
      // Draw virtual background.
      this.outputCanvasCtx!.drawImage(
        this.virtualBackgroundImage!,
        0,
        0,
        this.outputCanvas!.width,
        this.outputCanvas!.height
      )
    } else {
      // Image not decoded (yet, or failed to load): fall back to the raw
      // video so the participant never appears over a black background.
      this.outputCanvasCtx!.drawImage(this.videoElement!, 0, 0)
    }
  }

  /**
   * Draw the raw video without any effect. Used when segmentation is broken,
   * so the outgoing video keeps flowing instead of freezing on a stale frame.
   */
  _drawPassthroughFrame() {
    this.outputCanvasCtx!.globalCompositeOperation = 'copy'
    this.outputCanvasCtx!.filter = 'none'
    this.outputCanvasCtx!.drawImage(this.videoElement!, 0, 0)
  }

  async process() {
    if (this.destroyed) {
      return
    }
    try {
      this._syncOutputCanvasSize()

      // No decoded frame available (e.g. right after a device switch): skip
      // this tick rather than processing a 0x0 source.
      if (
        !this.videoElement ||
        this.videoElement.videoWidth === 0 ||
        this.videoElement.videoHeight === 0
      ) {
        this._scheduleNextFrame()
        return
      }

      if (this.passthrough) {
        this._drawPassthroughFrame()
        this._scheduleNextFrame()
        return
      }

      await this.sizeSource()
      await this.segment()

      if (this.destroyed) {
        return
      }

      if (this.options.type === 'blur') {
        await this.blur()
      } else {
        await this.drawVirtualBackground()
      }
      this.consecutiveErrors = 0
    } catch (error) {
      if (this.destroyed) {
        return
      }
      this.consecutiveErrors += 1
      if (this.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        // Degrade to passthrough: a working camera without the effect is
        // better than a permanently frozen frame.
        this.passthrough = true
        reportError('effects_processor_failure', error, {
          context:
            'Background processing failed repeatedly, falling back to unprocessed video',
          consecutive_errors: this.consecutiveErrors,
        })
        this.imageSegmenter?.close()
        this.imageSegmenter = undefined
      }
    }
    this._scheduleNextFrame()
  }

  _scheduleNextFrame() {
    if (this.destroyed) {
      return
    }
    this.timerWorker?.postMessage({
      id: SET_TIMEOUT,
      timeMs: FRAME_INTERVAL_MS,
    })
  }

  /**
   * Keep the output canvas in sync with the actual decoded video dimensions.
   * `MediaStreamTrack.getSettings()` can be incomplete or stale on Firefox,
   * so the video element is the source of truth.
   */
  _syncOutputCanvasSize() {
    const width = this.videoElement?.videoWidth
    const height = this.videoElement?.videoHeight
    if (!width || !height || !this.outputCanvas) {
      return
    }
    if (
      this.outputCanvas.width !== width ||
      this.outputCanvas.height !== height
    ) {
      this.outputCanvas.width = width
      this.outputCanvas.height = height
    }
  }

  _createMainCanvas() {
    const width =
      this.sourceSettings?.width || this.videoElement?.videoWidth || 1280
    const height =
      this.sourceSettings?.height || this.videoElement?.videoHeight || 720
    this.outputCanvas = this._createCanvas(BLUR_CANVAS_ID, width, height)
    this.outputCanvasCtx = this.outputCanvas.getContext('2d')!
  }

  _createMaskCanvas() {
    this.segmentationMaskCanvas = this._createCanvas(
      SEGMENTATION_MASK_CANVAS_ID,
      PROCESSING_WIDTH,
      PROCESSING_HEIGHT
    )
    // getImageData is called on this canvas 30 times per second: opt out of
    // GPU backing to avoid a costly readback on every frame.
    this.segmentationMaskCanvasCtx = this.segmentationMaskCanvas.getContext(
      '2d',
      { willReadFrequently: true }
    )!
  }

  _createCanvas(id: string, width: number, height: number) {
    const element = document.createElement('canvas')
    element.setAttribute('id', id)
    element.setAttribute('width', '' + width)
    element.setAttribute('height', '' + height)
    return element
  }

  async restart(opts: ProcessorOptions<Track.Kind>) {
    await this.destroy()
    return this.init(opts)
  }

  async destroy() {
    this.destroyed = true

    this.timerWorker?.postMessage({
      id: CLEAR_TIMEOUT,
    })

    // Let any in-flight frame finish before releasing the resources it uses,
    // so segmentForVideo is never called on a closed segmenter.
    try {
      await this.processing
    } catch {
      // Failures are already handled inside process().
    }
    this.processing = undefined

    if (this.onVideoLoaded && this.videoElement) {
      this.videoElement.removeEventListener('loadeddata', this.onVideoLoaded)
    }
    this.onVideoLoaded = undefined

    this.timerWorker?.terminate()
    this.timerWorker = undefined

    this.imageSegmenter?.close()
    this.imageSegmenter = undefined

    this.processedTrack?.stop()
    this.processedTrack = undefined

    this.outputCanvas = undefined
    this.outputCanvasCtx = undefined
    this.segmentationMaskCanvas = undefined
    this.segmentationMaskCanvasCtx = undefined
    this.sourceImageData = undefined
  }
}
