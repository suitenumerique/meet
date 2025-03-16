import {
  BackgroundBlur,
  BackgroundTransformer,
  ProcessorWrapper,
} from '@livekit/track-processors'
import { ProcessorOptions, Track } from 'livekit-client'
import {
  BackgroundProcessorInterface,
  BackgroundOptions,
  ProcessorType,
} from '.'

/**
 * This is simply a wrapper around track-processor-js Processor
 * in order to be compatible with a common interface BackgroundBlurProcessorInterface
 * used across the project.
 */
export class BackgroundBlurTrackProcessorJsWrapper
  implements BackgroundProcessorInterface
{
  name: string = 'blur'

  processor: ProcessorWrapper<BackgroundOptions>

  opts: BackgroundOptions

  constructor(opts: BackgroundOptions) {
    this.processor = BackgroundBlur(opts.blurRadius)
    this.opts = opts
  }

  async init(opts: ProcessorOptions<Track.Kind>) {
    return this.processor.init(opts)
  }

  async restart(opts: ProcessorOptions<Track.Kind>) {
    return this.processor.restart(opts)
  }

  async destroy() {
    return this.processor.destroy()
  }

  update(opts: BackgroundOptions): void {
    this.processor.updateTransformerOptions(opts)
  }

  get processedTrack() {
    return this.processor.processedTrack
  }

  get options() {
    return (this.processor.transformer as BackgroundTransformer).options
  }

  clone() {
    return new BackgroundBlurTrackProcessorJsWrapper({
      blurRadius: this.options!.blurRadius,
    })
  }

  serialize() {
    return {
      type: ProcessorType.BLUR,
      options: this.options,
    }
  }
}
