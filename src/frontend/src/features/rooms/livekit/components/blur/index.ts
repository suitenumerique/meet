import type { Track, TrackProcessor } from 'livekit-client'
import { AdvancedMattingProcessor } from './AdvancedMattingProcessor'
import { FaceLandmarksOptions } from './FaceLandmarksProcessor'

export const SELFIE_SEGMENTER_MODEL_PATH =
  '/assets/mediapipe/models/selfie_segmenter_landscape.tflite'

export const SELFIE_MULTICLASS_MODEL_PATH =
  '/assets/mediapipe/models/selfie_multiclass_256x256.tflite'

export const FACE_LANDMARKS_MODEL_PATH =
  '/assets/mediapipe/models/face_landmarker.task'

export const MEDIAPIPE_PATH_WASM = `/assets/mediapipe/wasm/${__MEDIAPIPE_VERSION__}`

export enum ProcessorType {
  BLUR = 'blur',
  VIRTUAL = 'virtual',
  FACE_LANDMARKS = 'faceLandmarks',
}

export enum SegmentationModel {
  AUTO = 'auto',
  LANDSCAPE = 'landscape',
  MULTICLASS = 'multiclass',
}

export type PostProcessingConfig = {
  erosion?: { pixels: number }
  opening?: { radius: number }
  closing?: { radius: number }
  ema?: { alpha: number }
}

export type UpsamplingConfig = {
  radius?: number
  eps?: number
}

export type PreProcessingConfig = {
  roiCropping?: { enabled: boolean }
}

export type ProcessorConfig =
  | {
      type: ProcessorType.BLUR
      blurRadius: number
      model?: SegmentationModel
      preProcessing?: PreProcessingConfig
      postProcessing?: PostProcessingConfig
      upsampling?: UpsamplingConfig
    }
  | {
      type: ProcessorType.VIRTUAL
      imagePath: string
      fileId?: string
      model?: SegmentationModel
      preProcessing?: PreProcessingConfig
      postProcessing?: PostProcessingConfig
      upsampling?: UpsamplingConfig
    }
  | ({ type: ProcessorType.FACE_LANDMARKS } & FaceLandmarksOptions)

export interface BackgroundProcessorInterface extends TrackProcessor<Track.Kind> {
  update(opts: ProcessorConfig): Promise<void>
  waitForReady?(): Promise<void>
  options: ProcessorConfig
}

export class BackgroundProcessorFactory {
  static hasModernApiSupport() {
    return true
  }

  static isSupported() {
    // AdvancedMattingProcessor does not rely on MediaStreamTrackProcessor /
    // MediaStreamTrackGenerator, so it is not limited to Chromium. It only
    // needs canvas.captureStream(); WebGL2 and the MediaPipe GPU delegate are
    // probed at runtime and fall back to Canvas2D / CPU when unavailable.
    if (typeof HTMLCanvasElement === 'undefined') return false
    if (!('captureStream' in HTMLCanvasElement.prototype)) return false
    return true
  }

  static getProcessor(
    config: ProcessorConfig
  ): BackgroundProcessorInterface | undefined {
    if (
      config.type !== ProcessorType.BLUR &&
      config.type !== ProcessorType.VIRTUAL
    ) {
      return undefined
    }
    return new AdvancedMattingProcessor(config)
  }

  static fromProcessorConfig(data?: ProcessorConfig) {
    if (data) {
      return BackgroundProcessorFactory.getProcessor(data)
    }
    return undefined
  }
}
