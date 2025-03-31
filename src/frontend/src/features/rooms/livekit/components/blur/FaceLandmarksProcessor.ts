import { ProcessorOptions, Track } from 'livekit-client'
import posthog from 'posthog-js'
import {
  FilesetResolver,
  FaceLandmarker,
  FaceLandmarkerResult,
} from '@mediapipe/tasks-vision'
import {
  CLEAR_TIMEOUT,
  SET_TIMEOUT,
  TIMEOUT_TICK,
  timerWorkerScript,
} from './TimerWorker'
import {
  BackgroundProcessorInterface,
  BackgroundOptions,
  ProcessorType,
} from '.'

const PROCESSING_WIDTH = 256 * 3
const PROCESSING_HEIGHT = 144 * 3

const FACE_LANDMARKS_CANVAS_ID = 'face-landmarks-local'

export class FaceLandmarksProcessor implements BackgroundProcessorInterface {
  options: BackgroundOptions
  name: string
  processedTrack?: MediaStreamTrack | undefined

  source?: MediaStreamTrack
  sourceSettings?: MediaTrackSettings
  videoElement?: HTMLVideoElement
  videoElementLoaded?: boolean

  // Canvas containing the video processing result
  outputCanvas?: HTMLCanvasElement
  outputCanvasCtx?: CanvasRenderingContext2D

  faceLandmarker?: FaceLandmarker
  faceLandmarkerResult?: FaceLandmarkerResult

  // The resized image of the video source
  sourceImageData?: ImageData

  timerWorker?: Worker

  type: ProcessorType

  // Effect images
  glassesImage?: HTMLImageElement
  mustacheImage?: HTMLImageElement
  beretImage?: HTMLImageElement
  constructor(opts: BackgroundOptions) {
    this.name = 'face_landmarks'
    this.options = opts
    this.type = ProcessorType.FACE_LANDMARKS
    this._initEffectImages()
  }

  private _initEffectImages() {
    this.glassesImage = new Image()
    this.glassesImage.src = '/assets/glasses.png'
    this.glassesImage.crossOrigin = 'anonymous'

    this.mustacheImage = new Image()
    this.mustacheImage.src = '/assets/mustache.png'
    this.mustacheImage.crossOrigin = 'anonymous'

    this.beretImage = new Image()
    this.beretImage.src = '/assets/beret.png'
    this.beretImage.crossOrigin = 'anonymous'
  }

  static get isSupported() {
    return true // Face landmarks should work in all modern browsers
  }

  async init(opts: ProcessorOptions<Track.Kind>) {
    if (!opts.element) {
      throw new Error('Element is required for processing')
    }

    this.source = opts.track as MediaStreamTrack
    this.sourceSettings = this.source!.getSettings()
    this.videoElement = opts.element as HTMLVideoElement

    this._createMainCanvas()

    const stream = this.outputCanvas!.captureStream()
    const tracks = stream.getVideoTracks()
    if (tracks.length == 0) {
      throw new Error('No tracks found for processing')
    }
    this.processedTrack = tracks[0]

    await this.initFaceLandmarker()
    this._initWorker()

    posthog.capture('face-landmarks-init')
  }

  _initWorker() {
    this.timerWorker = new Worker(timerWorkerScript, {
      name: 'FaceLandmarks',
    })
    this.timerWorker.onmessage = (data) => this.onTimerMessage(data)
    if (this.videoElementLoaded) {
      this.timerWorker!.postMessage({
        id: SET_TIMEOUT,
        timeMs: 1000 / 30,
      })
    } else {
      this.videoElement!.onloadeddata = () => {
        this.videoElementLoaded = true
        this.timerWorker!.postMessage({
          id: SET_TIMEOUT,
          timeMs: 1000 / 30,
        })
      }
    }
  }

  onTimerMessage(response: { data: { id: number } }) {
    if (response.data.id === TIMEOUT_TICK) {
      this.process()
    }
  }

  async initFaceLandmarker() {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
    )
    this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    })
  }

  async sizeSource() {
    this.outputCanvasCtx?.drawImage(
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

    this.sourceImageData = this.outputCanvasCtx?.getImageData(
      0,
      0,
      PROCESSING_WIDTH,
      PROCESSING_HEIGHT
    )
  }

  async detectFaces() {
    const startTimeMs = performance.now()
    this.faceLandmarkerResult = this.faceLandmarker!.detectForVideo(
      this.sourceImageData!,
      startTimeMs
    )
  }

  private drawEffect(
    leftPoint: { x: number; y: number },
    rightPoint: { x: number; y: number },
    image: HTMLImageElement,
    widthScale: number,
    heightScale: number,
    yOffset: number = 0
  ) {
    // Calculate distance between points
    const distance = Math.sqrt(
      Math.pow(rightPoint.x - leftPoint.x, 2) +
        Math.pow(rightPoint.y - leftPoint.y, 2)
    )

    // Scale image based on distance
    const width = distance * PROCESSING_WIDTH * widthScale
    const height = width * heightScale

    // Calculate center position between points
    const centerX = (leftPoint.x + rightPoint.x) / 2
    const centerY = (leftPoint.y + rightPoint.y) / 2 + yOffset

    // Draw image
    this.outputCanvasCtx!.save()
    this.outputCanvasCtx!.translate(
      centerX * PROCESSING_WIDTH,
      centerY * PROCESSING_HEIGHT
    )

    // Calculate rotation angle based on point positions
    const angle = Math.atan2(
      rightPoint.y - leftPoint.y,
      rightPoint.x - leftPoint.x
    )
    this.outputCanvasCtx!.rotate(angle)

    // Draw image centered at the midpoint between points
    this.outputCanvasCtx!.drawImage(
      image,
      -width / 2,
      -height / 2,
      width,
      height
    )

    this.outputCanvasCtx!.restore()
  }

  async drawFaceLandmarks() {
    // Draw the original video frame at the canvas size
    this.outputCanvasCtx!.drawImage(
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

    if (!this.faceLandmarkerResult?.faceLandmarks) {
      return
    }

    // Draw face landmarks (optional, for debugging)
    this.outputCanvasCtx!.strokeStyle = '#00FF00'
    this.outputCanvasCtx!.lineWidth = 2

    for (const face of this.faceLandmarkerResult.faceLandmarks) {
      // Find eye landmarks
      const leftEye = face[468]
      const rightEye = face[473]

      // Find mouth landmarks for mustache
      const leftMoustache = face[92]
      const rightMoustache = face[322]

      // Find forehead landmarks for beret
      const leftForehead = face[103]
      const rightForehead = face[332]

      if (leftEye && rightEye && this.options.showGlasses) {
        this.drawEffect(leftEye, rightEye, this.glassesImage!, 2.5, 0.7)
      }

      if (leftMoustache && rightMoustache && this.options.showFrench) {
        this.drawEffect(
          leftMoustache,
          rightMoustache,
          this.mustacheImage!,
          1.5,
          0.5
        )
      }

      if (leftForehead && rightForehead && this.options.showFrench) {
        this.drawEffect(
          leftForehead,
          rightForehead,
          this.beretImage!,
          2.1,
          0.7,
          -0.1
        )
      }
    }
  }

  async process() {
    await this.sizeSource()
    await this.detectFaces()
    await this.drawFaceLandmarks()

    this.timerWorker!.postMessage({
      id: SET_TIMEOUT,
      timeMs: 1000 / 30,
    })
  }

  _createMainCanvas() {
    this.outputCanvas = document.querySelector(
      `#${FACE_LANDMARKS_CANVAS_ID}`
    ) as HTMLCanvasElement
    if (!this.outputCanvas) {
      this.outputCanvas = this._createCanvas(
        FACE_LANDMARKS_CANVAS_ID,
        PROCESSING_WIDTH,
        PROCESSING_HEIGHT
      )
    }
    this.outputCanvasCtx = this.outputCanvas.getContext('2d')!
  }

  _createCanvas(id: string, width: number, height: number) {
    const element = document.createElement('canvas')
    element.setAttribute('id', id)
    element.setAttribute('width', '' + width)
    element.setAttribute('height', '' + height)
    return element
  }

  update(opts: BackgroundOptions): void {
    this.options = opts
  }

  async restart(opts: ProcessorOptions<Track.Kind>) {
    await this.destroy()
    return this.init(opts)
  }

  async destroy() {
    this.timerWorker?.postMessage({
      id: CLEAR_TIMEOUT,
    })

    this.timerWorker?.terminate()
    this.faceLandmarker?.close()
  }

  clone() {
    return new FaceLandmarksProcessor(this.options)
  }

  serialize() {
    return {
      type: this.type,
      options: this.options,
    }
  }
}
