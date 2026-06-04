
import { FilesetResolver, ImageSegmenter, ImageSegmenterResult } from '@mediapipe/tasks-vision'
import { pushMattingError } from '../errors/MattingErrorStore'

type MediapipeFileset = Awaited<
  ReturnType<typeof FilesetResolver.forVisionTasks>
>


export interface Segmenter {
  init(): Promise<void>
  segment(imageData: ImageData, timestampMs: number): Promise<Float32Array>
  destroy(): void
  readonly inputSize: { width: number; height: number }
}

export abstract class BaseMediaPipeSegmenter implements Segmenter {
  abstract readonly inputSize: { width: number; height: number }
  protected abstract readonly modelUrl: string
  protected abstract readonly modelName: string
  private imageSegmenter?: ImageSegmenter
  protected _maskBuffer?: Float32Array

  async init() {
    try {
      const [fileset, delegate] = await Promise.all([
        getMediapipeFileset(),
        probeMediapipeDelegate(),
      ])
      this.imageSegmenter = await ImageSegmenter.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: this.modelUrl,
          delegate,
        },
        runningMode: 'VIDEO',
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      })
    } catch (e) {
      pushMattingError({
        code: 'MEDIAPIPE_INIT_FAILED',
        level: 'error',
        detail: `${this.modelName}: ${e instanceof Error ? e.message : String(e)}`,
      })
      throw e
    }
  }

  protected abstract processSegmenterResult(result: ImageSegmenterResult): Float32Array

  async segment(
    imageData: ImageData,
    timestampMs: number
  ): Promise<Float32Array> {
    const segPromise = new Promise<Float32Array>((resolve) => {
      this.imageSegmenter!.segmentForVideo(
        imageData,
        timestampMs,
        (result: ImageSegmenterResult) => {
          resolve(this.processSegmenterResult(result))
        }
      )
    })
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('segment() timeout after 2s')), 2000)
    )
    return Promise.race([segPromise, timeout])
  }

  destroy() {
    this.imageSegmenter?.close()
    this.imageSegmenter = undefined
  }
}

const MEDIAPIPE_WASM_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'

let _filesetPromise: Promise<MediapipeFileset> | null = null

export function getMediapipeFileset(): Promise<MediapipeFileset> {
  _filesetPromise ??= FilesetResolver.forVisionTasks(
    MEDIAPIPE_WASM_URL
  ).catch((e) => {
    _filesetPromise = null
    throw e
  })
  return _filesetPromise
}

const FORCE_CPU_DELEGATE = false

let _delegateProbe: Promise<'GPU' | 'CPU'> | null = null


export function probeMediapipeDelegate(): Promise<'GPU' | 'CPU'> {
  if (FORCE_CPU_DELEGATE) {
    _delegateProbe ??= Promise.resolve('CPU')
    return _delegateProbe
  }
  _delegateProbe ??= (async () => {
    let webgl2Available = false
    try {
      const c = document.createElement('canvas')
      webgl2Available = !!c.getContext('webgl2')
    } catch {
      webgl2Available = false
    }
    if (!webgl2Available) return 'CPU'

    try {
      const fileset = await getMediapipeFileset()
      const probe = await ImageSegmenter.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      })
      probe.close()
      return 'GPU'
    } catch (e) {
      console.info('[matting:MEDIAPIPE_GPU_FALLBACK_TO_CPU]', e instanceof Error ? e.message : String(e))
      return 'CPU'
    }
  })()
  return _delegateProbe
}
