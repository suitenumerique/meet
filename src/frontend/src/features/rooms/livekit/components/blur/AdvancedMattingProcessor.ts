import { ProcessorOptions, Track } from 'livekit-client'
import {
  BackgroundProcessorInterface,
  ProcessorConfig,
  ProcessorType,
  SegmentationModel,
  PostProcessingConfig,
  UpsamplingConfig,
  PreProcessingConfig,
} from '.'
import { PreProcessingPipeline } from './preprocessing/PreProcessingPipeline'
import {
  Segmenter,
  createSegmenter,
} from './segmenters'
import { GpuRenderer, GpuRendererInitOpts } from './renderers/GpuRenderer'
import { WebGl2Renderer } from './renderers/WebGl2Renderer'
import { Canvas2dRenderer } from './renderers/Canvas2dRenderer'
import {
  pushMattingError,
  dismissMattingError,
} from './errors/MattingErrorStore'

import { MattingCanvasManager, createCanvas } from './preprocessing/MattingCanvasManager'
import { SegmenterBenchmarker } from './segmenters/SegmenterBenchmarker'
import { VideoFrameTracker } from './preprocessing/VideoFrameTracker'
import { SegmenterLoopRunner, FrameMaskPair } from './segmenters/SegmenterLoopRunner'
import { RenderLoopRunner } from './renderers/RenderLoopRunner'

const BLUR_CANVAS_ID = 'background-blur-local'
const DEFAULT_BLUR = 10

export class AdvancedMattingProcessor implements BackgroundProcessorInterface {
  options: ProcessorConfig
  name: string
  type: ProcessorType
  processedTrack?: MediaStreamTrack

  source?: MediaStreamTrack
  sourceSettings?: MediaTrackSettings
  videoElement?: HTMLVideoElement
  videoElementLoaded?: boolean

  outputCanvas?: HTMLCanvasElement

  private readonly _canvasManager = new MattingCanvasManager()
  private readonly _frameTracker = new VideoFrameTracker()
  private _segmenterRunner!: SegmenterLoopRunner
  private _renderRunner!: RenderLoopRunner

  segmenter?: Segmenter
  gpuRenderer?: GpuRenderer

  private _latestPair: FrameMaskPair | null = null
  private _segmenterFrameSkip = 2

  virtualBackgroundImage?: HTMLImageElement

  private _configuredModel?: SegmentationModel
  currentModel?: SegmentationModel
  processingWidth = 256
  processingHeight = 144
  private _pendingModel?: SegmentationModel
  private readonly _readyResolvers: Array<() => void> = []
  private _destroyed = false
  private _preProcessingPipeline?: PreProcessingPipeline

  constructor(opts: ProcessorConfig) {
    this.name = opts.type === ProcessorType.VIRTUAL ? 'virtual' : 'blur'
    this.options = opts
    this.type = opts.type
    this._initRunners()
  }

  private _initRunners() {
    this._segmenterRunner = new SegmenterLoopRunner(
      () => this.segmenter,
      () => this._preProcessingPipeline,
      () => this._canvasManager,
      () => this._frameTracker,
      () => this._segmenterFrameSkip,
      () => ({ w: this.processingWidth, h: this.processingHeight }),
      (pair) => this._onPairProduced(pair)
    )

    this._renderRunner = new RenderLoopRunner(
      () => this.gpuRenderer,
      () => this._frameTracker,
      () => this._latestPair,
      (w, h) => this._canvasManager.getPassthroughMask(w, h),
      () => ({ w: this.processingWidth, h: this.processingHeight })
    )
  }

  private _onPairProduced(pair: FrameMaskPair) {
    const prev = this._latestPair
    this._latestPair = pair
    prev?.source.close()
  }

  waitForReady(): Promise<void> {
    if (this.segmenter || this._destroyed) return Promise.resolve()
    return new Promise((resolve) => this._readyResolvers.push(resolve))
  }

  private _resolveReady() {
    this._readyResolvers.splice(0).forEach((r) => r())
  }

  async init(opts: ProcessorOptions<Track.Kind>) {
    this._destroyed = false
    if (!opts.element) {
      throw new Error('Element is required for processing')
    }
    const track = opts.track as MediaStreamTrack
    this.source = track
    this.sourceSettings = track.getSettings()
    this.videoElement = opts.element as HTMLVideoElement
    const video = this.videoElement

    try {
      if (video.videoWidth === 0 || video.readyState < 2) {
        await new Promise<void>((resolve) => {
          const handleLoaded = () => {
            if (video.videoWidth > 0) {
              cleanup()
              resolve()
            }
          }
          const cleanup = () => {
            video.removeEventListener('loadedmetadata', handleLoaded)
            video.removeEventListener('loadeddata', handleLoaded)
            video.removeEventListener('canplay', handleLoaded)
            video.removeEventListener('playing', handleLoaded)
          }
          video.addEventListener('loadedmetadata', handleLoaded)
          video.addEventListener('loadeddata', handleLoaded)
          video.addEventListener('canplay', handleLoaded)
          video.addEventListener('playing', handleLoaded)
          setTimeout(() => {
            cleanup()
            resolve()
          }, 1000)
        })
      }

      if (this._destroyed) return

      const realW = video.videoWidth || this.sourceSettings?.width || 1280
      const realH = video.videoHeight || this.sourceSettings?.height || 720

      this._initVirtualBackgroundImage()
      this._createMainCanvasWithSize(realW, realH)
      this._canvasManager.ensureMaskCanvas(this.processingWidth, this.processingHeight)

      const { post, up } = this._getEffectsConfig()
      const rendererOpts: GpuRendererInitOpts = {
        outW: realW,
        outH: realH,
        processingW: this.processingWidth,
        processingH: this.processingHeight,
        postProcessing: post,
        upsampling: up,
      }
      this.gpuRenderer = await this._initRendererWithFallback(rendererOpts)
      this._applyRendererConfig()

      if (this._destroyed) return

      if (!this.outputCanvas!.captureStream) {
        pushMattingError({
          code: 'CAPTURESTREAM_UNSUPPORTED',
          level: 'error',
          detail: 'captureStream API is not supported on this browser',
        })
        this.processedTrack = this.source
        return
      }
      const stream = this.outputCanvas!.captureStream(30)
      const tracks = stream.getVideoTracks()
      if (tracks.length === 0) {
        throw new Error('No tracks found in captureStream()')
      }
      this.processedTrack = tracks[0]

      this._startLoops()

      this._configuredModel = this._getModel(this.options)
      this._loadSegmenter(this._configuredModel, true)
    } catch (e) {
      pushMattingError({
        code: 'WEBGL2_INIT_FAILED',
        level: 'warn',
        detail: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      })
      this.processedTrack = this.source
    }
  }

  private _stopTrackCleanup() {
    if (this.processedTrack && this.processedTrack !== this.source) {
      try {
        this.processedTrack.stop()
      } catch {
        // best-effort
      }
    }
    this.processedTrack = undefined
  }

  async update(opts: ProcessorConfig): Promise<void> {
    this.options = opts
    this.type = opts.type
    this.name = opts.type === ProcessorType.VIRTUAL ? 'virtual' : 'blur'

    if (!this.gpuRenderer) {
      return
    }

    const prevConfigured = this._configuredModel
    const newModel = this._getModel(opts)
    this._configuredModel = newModel

    this._initVirtualBackgroundImage()

    if (newModel !== prevConfigured) {
      this._loadSegmenter(newModel, !this.segmenter)
    }
    this._applyRendererConfig()
  }

  private _getModel(opts: ProcessorConfig): SegmentationModel {
    if (
      opts.type === ProcessorType.BLUR ||
      opts.type === ProcessorType.VIRTUAL
    ) {
      return opts.model ?? SegmentationModel.AUTO
    }
    return SegmentationModel.AUTO
  }

  private _publishBenchmarkPair(mask: Float32Array, source: ImageBitmap, captureTime: number) {
    this._onPairProduced({
      mask,
      source,
      captureTime,
      cameraCaptureTime: captureTime,
      procW: this.processingWidth,
      procH: this.processingHeight,
    })
  }

  private _getEffectsConfig(): {
    post: PostProcessingConfig
    up: UpsamplingConfig
    pre: PreProcessingConfig | undefined
  } {
    if (
      this.options.type === ProcessorType.BLUR ||
      this.options.type === ProcessorType.VIRTUAL
    ) {
      return {
        post: this.options.postProcessing ?? {
          erosion: { pixels: 3 },
          ema: { alpha: 0.7 },
          opening: { radius: 3 },
          closing: { radius: 3 },
        },
        up: this.options.upsampling ?? {
          radius: 8,
          eps: 0.01,
        },
        pre: this.options.preProcessing ?? {
          roiCropping: { enabled: true },
        },
      }
    }
    return { post: {}, up: {}, pre: undefined }
  }

  private async _initRendererWithFallback(
    opts: GpuRendererInitOpts
  ): Promise<GpuRenderer> {
    const webgl2 = new WebGl2Renderer()
    try {
      await webgl2.init(this.outputCanvas!, opts)
      return webgl2
    } catch (e) {
      pushMattingError({
        code: 'CANVAS2D_FALLBACK',
        level: 'info',
        detail: `WebGL2 unavailable, using Canvas2D fallback: ${e instanceof Error ? e.message : String(e)}`,
      })
      const c2d = new Canvas2dRenderer()
      await c2d.init(this.outputCanvas!, opts)
      dismissMattingError('WEBGL2_INIT_FAILED')
      return c2d
    }
  }

  private _applyRendererConfig() {
    if (!this.gpuRenderer) return
    const mode =
      this.options.type === ProcessorType.VIRTUAL ? 'virtual' : 'blur'
    this.gpuRenderer.setMode(mode)
    if (this.options.type === ProcessorType.BLUR) {
      this.gpuRenderer.setBlurRadius(this.options.blurRadius ?? DEFAULT_BLUR)
    }
    const { post, up, pre } = this._getEffectsConfig()
    this.gpuRenderer.setPostProcessing(post)
    this.gpuRenderer.setUpsampling(up)
    this.gpuRenderer.setVirtualBackground(
      this.options.type === ProcessorType.VIRTUAL
        ? (this.virtualBackgroundImage ?? null)
        : null
    )

    this._preProcessingPipeline = pre?.roiCropping?.enabled
      ? new PreProcessingPipeline(pre)
      : undefined
  }

  private async _calibrateMulticlass(
    seg: Segmenter,
    model: SegmentationModel
  ): Promise<{ seg: Segmenter; targetModel: SegmentationModel } | undefined> {
    const isCancelled = () => this._destroyed || this._pendingModel !== model

    const benchResult = await SegmenterBenchmarker.benchmarkSegmenter(
      seg,
      this.videoElement,
      (mask, source, time) => this._publishBenchmarkPair(mask, source, time),
      isCancelled
    )

    if (isCancelled()) {
      seg.destroy()
      return undefined
    }

    if (benchResult === 'landscape' && model === SegmentationModel.AUTO) {
      seg.destroy()
      const landscapeSeg = createSegmenter(SegmentationModel.LANDSCAPE)
      await landscapeSeg.init()
      if (isCancelled()) {
        landscapeSeg.destroy()
        return undefined
      }
      return { seg: landscapeSeg, targetModel: SegmentationModel.LANDSCAPE }
    }

    this._segmenterFrameSkip = benchResult === 'multiclass_skip1' ? 1 : 2
    return { seg, targetModel: SegmentationModel.MULTICLASS }
  }

  private async _calibrateLandscape(
    seg: Segmenter,
    model: SegmentationModel
  ): Promise<boolean> {
    const isCancelled = () => this._destroyed || this._pendingModel !== model

    const skipResult = await SegmenterBenchmarker.benchmarkLandscapeSkip(
      seg,
      this.videoElement,
      (mask, source, time) => this._publishBenchmarkPair(mask, source, time),
      isCancelled
    )

    if (isCancelled()) {
      return false
    }

    this._segmenterFrameSkip = skipResult === 'skip1' ? 1 : 2
    return true
  }

  private async _createAndCalibrateSegmenter(model: SegmentationModel): Promise<{
    seg: Segmenter
    targetModel: SegmentationModel
  } | undefined> {
    const isCancelled = () => this._destroyed || this._pendingModel !== model

    let targetModel: SegmentationModel = model === SegmentationModel.AUTO ? SegmentationModel.MULTICLASS : model
    let seg = createSegmenter(targetModel)
    await seg.init()

    if (isCancelled()) {
      seg.destroy()
      return undefined
    }

    if (targetModel === SegmentationModel.MULTICLASS) {
      const calibrated = await this._calibrateMulticlass(seg, model)
      if (!calibrated) return undefined
      seg = calibrated.seg
      targetModel = calibrated.targetModel
    }

    if (targetModel === SegmentationModel.LANDSCAPE) {
      const ok = await this._calibrateLandscape(seg, model)
      if (!ok) {
        seg.destroy()
        return undefined
      }
    }

    return { seg, targetModel }
  }

  private async _loadSegmenter(model: SegmentationModel, firstInit: boolean) {
    if (this._destroyed) return
    this._pendingModel = model
    try {
      const result = await this._createAndCalibrateSegmenter(model)
      if (!result || this._destroyed || this._pendingModel !== model) {
        return
      }

      const old = this.segmenter
      this.segmenter = result.seg
      this.currentModel = result.targetModel
      this.processingWidth = result.seg.inputSize.width
      this.processingHeight = result.seg.inputSize.height
      old?.destroy()
      this._resizeMaskIfNeeded()
      this._resolveReady()
    } catch (e) {
      if (!this._destroyed && this._pendingModel === model) {
        console.error(
          firstInit
            ? '[AMP] segmenter init failed — running in passthrough mode'
            : '[AMP] segmenter switch failed',
          e
        )
        if (firstInit) {
          this.segmenter = undefined
        }
        this._resolveReady()
      }
    }
  }

  private _resizeMaskIfNeeded() {
    this._canvasManager.ensureMaskCanvas(this.processingWidth, this.processingHeight)
    this.gpuRenderer?.resizeProcessing(
      this.processingWidth,
      this.processingHeight
    )
    if (this._latestPair) {
      try {
        this._latestPair.source.close()
      } catch {
        /* ImageBitmap.close() — best-effort */
      }
      this._latestPair = null
    }
  }

  private _initVirtualBackgroundImage() {
    if (this.options.type !== ProcessorType.VIRTUAL) {
      this.virtualBackgroundImage = undefined
      return
    }
    const path = this.options.imagePath
    const currentPath = this.virtualBackgroundImage?.dataset.srcPath
    if (currentPath === path) return

    const img = document.createElement('img')
    img.crossOrigin = 'anonymous'
    img.dataset.srcPath = path
    img.onerror = () => {
      pushMattingError({
        code: 'VIRTUAL_BG_LOAD_FAILED',
        level: 'warn',
        detail: `Failed to load background image: ${path}`,
      })
    }
    img.src = path
    this.virtualBackgroundImage = img
  }


  private _startLoops(): void {
    if (this._destroyed) return
    if (this.videoElementLoaded || this.videoElement!.readyState >= 2) {
      this._launch()
    } else {
      this.videoElement!.onloadeddata = () => {
        if (this._destroyed) return
        this._launch()
      }
    }
  }

  private _launch(): void {
    if (this._destroyed) return
    this.videoElementLoaded = true
    this._frameTracker.start(this.videoElement!)
    this._segmenterRunner.start(this.videoElement!)
    this._renderRunner.start(this.videoElement!)
  }

  private _createMainCanvasWithSize(w: number, h: number) {
    let canvas = document.querySelector(
      `canvas#${BLUR_CANVAS_ID}`
    ) as HTMLCanvasElement | null
    if (canvas) {
      canvas.setAttribute('width', '' + w)
      canvas.setAttribute('height', '' + h)
    } else {
      canvas = createCanvas(BLUR_CANVAS_ID, w, h)
    }
    this.outputCanvas = canvas
  }

  async restart(opts: ProcessorOptions<Track.Kind>) {
    await this.destroy()
    return this.init(opts)
  }

  async destroy() {
    this._destroyed = true
    this._pendingModel = undefined
    this._configuredModel = undefined
    this.videoElementLoaded = false

    this._segmenterRunner.stop()
    this._renderRunner.stop()
    this._frameTracker.stop()

    if (this.videoElement) {
      this.videoElement.onloadeddata = null
    }
    this.segmenter?.destroy()
    this.segmenter = undefined
    this.gpuRenderer?.destroy()
    this.gpuRenderer = undefined
    this._preProcessingPipeline = undefined
    this._canvasManager.destroy()
    if (this._latestPair) {
      try {
        this._latestPair.source.close()
      } catch {
        /* ImageBitmap.close() — best-effort */
      }
      this._latestPair = null
    }
    this._resolveReady()
    this._stopTrackCleanup()
  }
}