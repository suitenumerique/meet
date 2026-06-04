/**
 * MediaPipe binary Selfie Segmenter in landscape mode (256×144).
 *
 * Called by: segmenters/index.ts createSegmenter() and
 * AdvancedMattingProcessor._createAndCalibrateSegmenter() when the device
 * cannot sustain the multiclass model or SegmentationModel.LANDSCAPE is set.
 *
 * Pipeline role: The lighter of the two segmenters. segment() returns a
 * Float32Array where high values indicate the person (foreground). Reuses a
 * single output buffer across frames to avoid per-frame GC pressure.
 */
import { ImageSegmenterResult } from '@mediapipe/tasks-vision'
import { BaseMediaPipeSegmenter } from './Segmenter'

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite'

export class LandscapeSegmenter extends BaseMediaPipeSegmenter {
  readonly inputSize = { width: 256, height: 144 }
  protected readonly modelUrl = MODEL_URL
  protected readonly modelName = 'Landscape model'

  protected processSegmenterResult(result: ImageSegmenterResult): Float32Array {
    // For this binary model, confidenceMasks[0] is the foreground (person) probability
    // directly — NOT background. Unlike multiclass (where class 0 = background),
    // the binary landscape model emits a single mask where high value = person.
    const fg = result.confidenceMasks![0].getAsFloat32Array()
    // Copy into reusable buffer: getAsFloat32Array() returns a view into
    // a MediaPipe-managed buffer that gets recycled on the next call.
    if (!this._maskBuffer || this._maskBuffer.length !== fg.length) {
      this._maskBuffer = new Float32Array(fg.length)
    }
    this._maskBuffer.set(fg)
    return this._maskBuffer
  }
}
