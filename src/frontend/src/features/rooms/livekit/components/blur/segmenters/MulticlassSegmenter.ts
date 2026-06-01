/**
 * MediaPipe 6-class Selfie Segmenter (256×256).
 *
 * Called by: segmenters/index.ts createSegmenter() — used by default in AUTO
 * mode and when SegmentationModel.MULTICLASS is set explicitly.
 *
 * Pipeline role: Higher-quality segmenter that classifies each pixel into six
 * categories (background, hair, body-skin, face-skin, clothes, others).
 * segment() converts the result to a single-channel person probability
 * (1 − background_confidence). Selected only when the startup benchmark
 * measures p75 latency ≤ 50 ms.
 */
import { ImageSegmenter, ImageSegmenterResult } from '@mediapipe/tasks-vision'
import {
  Segmenter,
  getMediapipeFileset,
  probeMediapipeDelegate,
} from './Segmenter'
import { pushMattingError } from '../errors/MattingErrorStore'

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite'

/**
 * MediaPipe Selfie Multiclass segmenter.
 * Outputs 6 classes: 0=background, 1=hair, 2=body-skin, 3=face-skin, 4=clothes, 5=others.
 * The "person" probability is built as 1 - background_prob.
 */
export class MulticlassSegmenter implements Segmenter {
  readonly inputSize = { width: 256, height: 256 }
  private imageSegmenter?: ImageSegmenter
  // Reusable output buffer — avoids per-frame Float32Array allocation.
  private _maskBuffer?: Float32Array

  async init() {
    try {
      const [fileset, delegate] = await Promise.all([
        getMediapipeFileset(),
        probeMediapipeDelegate(),
      ])
      this.imageSegmenter = await ImageSegmenter.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
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
        detail: `Multiclass model: ${e instanceof Error ? e.message : String(e)}`,
      })
      throw e
    }
  }

  async segment(
    imageData: ImageData,
    timestampMs: number
  ): Promise<Float32Array> {
    const segPromise = new Promise<Float32Array>((resolve) => {
      this.imageSegmenter!.segmentForVideo(
        imageData,
        timestampMs,
        (result: ImageSegmenterResult) => {
          const masks = result.confidenceMasks!
          // confidenceMasks[0] is the background probability.
          const bg = masks[0].getAsFloat32Array()
          const len = bg.length
          if (!this._maskBuffer || this._maskBuffer.length !== len) {
            this._maskBuffer = new Float32Array(len)
          }
          const out = this._maskBuffer
          for (let i = 0; i < len; i++) {
            const v = 1 - bg[i]
            out[i] = v < 0 ? 0 : v > 1 ? 1 : v
          }
          resolve(out)
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
