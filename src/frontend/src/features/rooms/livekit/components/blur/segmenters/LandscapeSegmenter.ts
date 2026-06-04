import { ImageSegmenterResult } from '@mediapipe/tasks-vision'
import { BaseMediaPipeSegmenter } from './Segmenter'

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite'

export class LandscapeSegmenter extends BaseMediaPipeSegmenter {
  readonly inputSize = { width: 256, height: 144 }
  protected readonly modelUrl = MODEL_URL
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
