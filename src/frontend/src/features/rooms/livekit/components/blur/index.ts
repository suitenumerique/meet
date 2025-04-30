import { ProcessorWrapper } from '@livekit/track-processors'
import { Track, TrackProcessor } from 'livekit-client'
import { BackgroundBlurTrackProcessorJsWrapper } from './BackgroundBlurTrackProcessorJsWrapper'
import { BackgroundCustomProcessor } from './BackgroundCustomProcessor'
import { BackgroundVirtualTrackProcessorJsWrapper } from './BackgroundVirtualTrackProcessorJsWrapper'

export type BackgroundOptions = {
  blurRadius?: number
  imagePath?: string
}

export interface ProcessorSerialized {
  type: ProcessorType
  options: BackgroundOptions
}

export interface BackgroundProcessorInterface
  extends TrackProcessor<Track.Kind> {
  update(opts: BackgroundOptions): void
  options: BackgroundOptions
  clone(): BackgroundProcessorInterface
  serialize(): ProcessorSerialized
}

export enum ProcessorType {
  BLUR = 'blur',
  VIRTUAL = 'virtual',
  FACE_LANDMARKS = 'faceLandmarks',
}

export class BackgroundProcessorFactory {
  static hasModernApiSupport() {
    return ProcessorWrapper.hasModernApiSupport
  }

  static isSupported() {
    return ProcessorWrapper.isSupported || BackgroundCustomProcessor.isSupported
  }

  static getProcessor(
    type: ProcessorType,
    opts: BackgroundOptions
  ): BackgroundProcessorInterface | undefined {
    if (type === ProcessorType.BLUR) {
      if (ProcessorWrapper.isSupported) {
        return new BackgroundBlurTrackProcessorJsWrapper(opts)
      }
      if (BackgroundCustomProcessor.isSupported) {
        return new BackgroundCustomProcessor(opts)
      }
    } else if (type === ProcessorType.VIRTUAL) {
      if (ProcessorWrapper.isSupported) {
        return new BackgroundVirtualTrackProcessorJsWrapper(opts)
      }
      if (BackgroundCustomProcessor.isSupported) {
        return new BackgroundCustomProcessor(opts)
      }
    }
    return undefined
  }

  static deserializeProcessor(data?: ProcessorSerialized) {
    if (data?.type) {
      return BackgroundProcessorFactory.getProcessor(data?.type, data?.options)
    }
    return undefined
  }
}
