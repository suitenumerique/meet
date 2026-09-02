import {
  ProcessorWrapper,
  supportsBackgroundProcessors,
} from '@livekit/track-processors'
import type { Track, TrackProcessor } from 'livekit-client'
import { BackgroundCustomProcessor } from './BackgroundCustomProcessor'
import { UnifiedBackgroundTrackProcessor } from './UnifiedBackgroundTrackProcessor'
import { FaceLandmarksOptions } from './FaceLandmarksProcessor'
import { captureEvent } from '@/features/analytics/telemetry'

export const SELFIE_SEGMENTER_MODEL_PATH =
  '/assets/mediapipe/models/selfie_segmenter_landscape.tflite'

export const FACE_LANDMARKS_MODEL_PATH =
  '/assets/mediapipe/models/face_landmarker.task'

export const MEDIAPIPE_PATH_WASM = `/assets/mediapipe/wasm/${__MEDIAPIPE_VERSION__}`

export enum ProcessorType {
  BLUR = 'blur',
  VIRTUAL = 'virtual',
  FACE_LANDMARKS = 'faceLandmarks',
}

export type ProcessorConfig =
  | { type: ProcessorType.BLUR; blurRadius: number }
  | { type: ProcessorType.VIRTUAL; imagePath: string; fileId?: string }
  | ({ type: ProcessorType.FACE_LANDMARKS } & FaceLandmarksOptions)

export interface BackgroundProcessorInterface extends TrackProcessor<Track.Kind> {
  update(opts: ProcessorConfig): Promise<void>
  options: ProcessorConfig
}

export class BackgroundProcessorFactory {
  private static _isSupported?: boolean

  static hasModernApiSupport() {
    return ProcessorWrapper.hasModernApiSupport
  }

  static isSupported() {
    if (this._isSupported === undefined) {
      this._isSupported =
        supportsBackgroundProcessors() || BackgroundCustomProcessor.isSupported
    }

    if (!this._isSupported) {
      captureEvent('background-processor-unsupported', {
        path: 'isSupported',
      })
    }

    return this._isSupported
  }

  static getProcessor(
    config: ProcessorConfig
  ): BackgroundProcessorInterface | undefined {
    const isBlur = config.type === ProcessorType.BLUR
    const isVirtual = config.type === ProcessorType.VIRTUAL

    if (!isBlur && !isVirtual) return undefined

    if (supportsBackgroundProcessors()) {
      return new UnifiedBackgroundTrackProcessor(config)
    }

    if (BackgroundCustomProcessor.isSupported) {
      return new BackgroundCustomProcessor(config)
    }

    captureEvent('background-processor-unsupported', {
      path: 'getProcessor',
    })

    return undefined
  }

  static fromProcessorConfig(data?: ProcessorConfig) {
    if (data) {
      return BackgroundProcessorFactory.getProcessor(data)
    }
    return undefined
  }
}
