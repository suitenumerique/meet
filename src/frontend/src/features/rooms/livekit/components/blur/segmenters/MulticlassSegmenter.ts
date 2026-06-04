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
import { ImageSegmenterResult } from '@mediapipe/tasks-vision'
import { BaseMediaPipeSegmenter } from './Segmenter'

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite'

/**
 * MediaPipe Selfie Multiclass segmenter.
 * Outputs 6 classes: 0=background, 1=hair, 2=body-skin, 3=face-skin, 4=clothes, 5=others.
 * The "person" probability is built as 1 - background_prob.
 */
export class MulticlassSegmenter extends BaseMediaPipeSegmenter {
  readonly inputSize = { width: 256, height: 256 }
  protected readonly modelUrl = MODEL_URL
  protected readonly modelName = 'Multiclass model'

  protected processSegmenterResult(result: ImageSegmenterResult): Float32Array {
    const bg = result.confidenceMasks![0].getAsFloat32Array()
    const len = bg.length
    if (!this._maskBuffer || this._maskBuffer.length !== len) {
      this._maskBuffer = new Float32Array(len)
    }
    const out = this._maskBuffer
    for (let i = 0; i < len; i++) {
      const v = 1 - bg[i]
      out[i] = Math.max(0, Math.min(1, v))
    }
    return out
  }
}
