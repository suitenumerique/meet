import { ImageSegmenterResult } from '@mediapipe/tasks-vision'
import { BaseMediaPipeSegmenter } from './Segmenter'
import { SELFIE_SEGMENTER_MODEL_PATH } from '..'

export class LandscapeSegmenter extends BaseMediaPipeSegmenter {
  readonly inputSize = { width: 256, height: 144 }
  protected readonly modelUrl = SELFIE_SEGMENTER_MODEL_PATH
  protected readonly modelName = 'Landscape model'

  protected processSegmenterResult(result: ImageSegmenterResult): Float32Array {
    const fg = result.confidenceMasks![0].getAsFloat32Array()
    if (!this._maskBuffer || this._maskBuffer.length !== fg.length) {
      this._maskBuffer = new Float32Array(fg.length)
    }
    this._maskBuffer.set(fg)
    return this._maskBuffer
  }
}
