import {
  ProcessorWrapper,
  supportsBackgroundProcessors,
} from '@livekit/track-processors'
import type { Track, TrackProcessor } from 'livekit-client'
import { BackgroundCustomProcessor } from './BackgroundCustomProcessor'
import { UnifiedBackgroundTrackProcessor } from './UnifiedBackgroundTrackProcessor'
import { FaceLandmarksOptions } from './FaceLandmarksProcessor'
import selfieSegmenterModelUrl from '@/assets/mediapipe/selfie_segmenter_landscape.tflite?url'
import faceLandmarkerModelUrl from '@/assets/mediapipe/face_landmarker.task?url'

// Imported with ?url so Vite emits each model under /assets with a content
// hash in its file name: nginx caches them for 30 days, and a new model gets
// a new URL instead of a stale cache entry.
export const SELFIE_SEGMENTER_MODEL_PATH = selfieSegmenterModelUrl

export const FACE_LANDMARKS_MODEL_PATH = faceLandmarkerModelUrl

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
  static hasModernApiSupport() {
    return ProcessorWrapper.hasModernApiSupport
  }

  static isSupported() {
    return (
      supportsBackgroundProcessors() || BackgroundCustomProcessor.isSupported
    )
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

    return undefined
  }

  static fromProcessorConfig(data?: ProcessorConfig) {
    if (data) {
      return BackgroundProcessorFactory.getProcessor(data)
    }
    return undefined
  }
}
