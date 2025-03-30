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

  // Glasses image element
  glassesImage?: HTMLImageElement

  constructor(opts: BackgroundOptions) {
    this.name = 'face_landmarks'
    this.options = opts
    this.type = ProcessorType.FACE_LANDMARKS
    this._initGlassesImage()
  }

  private _initGlassesImage() {
    this.glassesImage = new Image()
    this.glassesImage.src = '/assets/glasses.png' // You'll need to add this image to your public assets
    this.glassesImage.crossOrigin = 'anonymous'
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
      // Find eye landmarks (indices 33 and 263 are the left and right eye centers)
      const leftEye = face[33]
      const rightEye = face[263]
      
      if (leftEye && rightEye) {
        // Calculate glasses position and size
        const eyeDistance = Math.sqrt(
          Math.pow(rightEye.x - leftEye.x, 2) + 
          Math.pow(rightEye.y - leftEye.y, 2)
        )
        
        // Scale glasses based on eye distance
        const glassesWidth = eyeDistance * PROCESSING_WIDTH * 2.5 // Adjust multiplier as needed
        const glassesHeight = glassesWidth * 0.7 // Adjust aspect ratio as needed
        
        // Calculate center position between eyes
        const centerX = (leftEye.x + rightEye.x) / 2
        const centerY = (leftEye.y + rightEye.y) / 2
        
        // Draw glasses
        this.outputCanvasCtx!.save()
        this.outputCanvasCtx!.translate(
          centerX * PROCESSING_WIDTH,
          centerY * PROCESSING_HEIGHT
        )
        
        // Calculate rotation angle based on eye positions
        const angle = Math.atan2(
          rightEye.y - leftEye.y,
          rightEye.x - leftEye.x
        )
        this.outputCanvasCtx!.rotate(angle)
        
        // Draw glasses centered at the midpoint between eyes
        this.outputCanvasCtx!.drawImage(
          this.glassesImage!,
          -glassesWidth / 2,
          -glassesHeight / 2,
          glassesWidth,
          glassesHeight
        )
        
        this.outputCanvasCtx!.restore()
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