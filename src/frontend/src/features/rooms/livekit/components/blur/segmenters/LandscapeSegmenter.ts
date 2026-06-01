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
import { ImageSegmenter, ImageSegmenterResult } from '@mediapipe/tasks-vision'
import {
  Segmenter,
  getMediapipeFileset,
  probeMediapipeDelegate,
} from './Segmenter'
import { pushMattingError } from '../errors/MattingErrorStore'

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite'

export class LandscapeSegmenter implements Segmenter {
  readonly inputSize = { width: 256, height: 144 }
  private imageSegmenter?: ImageSegmenter
  // Reusable output buffer — avoids allocating a new Float32Array every frame.
  // MediaPipe recycles its internal buffer, so a copy is mandatory, but we
  // can reuse the same destination across frames.
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
        detail: `Landscape model: ${e instanceof Error ? e.message : String(e)}`,
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
          resolve(this._maskBuffer)
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
