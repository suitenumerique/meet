import { ProcessorWrapper } from '@livekit/track-processors'
import { Track, TrackProcessor } from 'livekit-client'
import { BackgroundCustomProcessor } from './BackgroundCustomProcessor'
import { UnifiedBackgroundTrackProcessor } from './UnifiedBackgroundTrackProcessor'
import { FaceLandmarksOptions } from './FaceLandmarksProcessor'

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
    return ProcessorWrapper.isSupported || BackgroundCustomProcessor.isSupported
  }

  static getProcessor(
    config: ProcessorConfig
  ): BackgroundProcessorInterface | undefined {
    const isBlur = config.type === ProcessorType.BLUR
    const isVirtual = config.type === ProcessorType.VIRTUAL

    if (!isBlur && !isVirtual) return undefined

    if (ProcessorWrapper.isSupported) {
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
