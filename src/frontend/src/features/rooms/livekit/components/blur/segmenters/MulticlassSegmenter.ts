import { ImageSegmenterResult } from '@mediapipe/tasks-vision'
import { BaseMediaPipeSegmenter } from './Segmenter'
import { SELFIE_MULTICLASS_MODEL_PATH } from '..'

export class MulticlassSegmenter extends BaseMediaPipeSegmenter {
  readonly inputSize = { width: 256, height: 256 }
  protected readonly modelUrl = SELFIE_MULTICLASS_MODEL_PATH
  protected readonly modelName = 'Multiclass model'

  protected processSegmenterResult(result: ImageSegmenterResult): Float32Array {
    const masks = result.confidenceMasks!
    const len = masks[0].getAsFloat32Array().length
    if (!this._maskBuffer || this._maskBuffer.length !== len) {
      this._maskBuffer = new Float32Array(len)
    }
    const out = this._maskBuffer
    out.fill(0)
    for (let cls = 1; cls <= 5; cls++) {
      const data = masks[cls].getAsFloat32Array()
      for (let i = 0; i < len; i++) {
        out[i] += data[i]
      }
    }
    for (let i = 0; i < len; i++) {
      if (out[i] > 1) out[i] = 1
    }
    return out
  }
}
