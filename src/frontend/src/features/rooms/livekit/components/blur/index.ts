/**
 * Public API of the blur module.
 *
 * Exports the ProcessorType and SegmentationModel enums, all configuration
 * types (ProcessorConfig, PostProcessingConfig, UpsamplingConfig,
 * PreProcessingConfig), the BackgroundProcessorInterface, and the
 * BackgroundProcessorFactory that instantiates AdvancedMattingProcessor.
 *
 * Called by: EffectsConfiguration.tsx, VideoTab.tsx, Join.tsx, Conference.tsx,
 * VideoDeviceControl.tsx, FunnyEffects.tsx, usePersistentUserChoices.ts,
 * userChoices.ts.
 *
 * Pipeline role: Entry point for all external consumers. Callers obtain a
 * processor via BackgroundProcessorFactory.getProcessor(config) and attach it
 * to a LiveKit video track; the processor replaces the raw camera track with a
 * composited MediaStreamTrack captured from the output canvas.
 */
import { Track, TrackProcessor } from 'livekit-client'
import { AdvancedMattingProcessor } from './AdvancedMattingProcessor'
import { FaceLandmarksOptions } from './FaceLandmarksProcessor'

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
