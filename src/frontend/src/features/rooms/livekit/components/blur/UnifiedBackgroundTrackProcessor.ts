import { ProcessorOptions, Track } from 'livekit-client'
import {
  BackgroundBlur,
  BackgroundTransformer,
  ProcessorWrapper,
  VirtualBackground,
} from '@livekit/track-processors'
import {
  BackgroundOptions,
  BackgroundProcessorInterface,
  ProcessorType,
} from '.'

export class UnifiedBackgroundTrackProcessor implements BackgroundProcessorInterface {
  processor: ProcessorWrapper<BackgroundOptions>
  opts: BackgroundOptions
  processorType: ProcessorType

  constructor(opts: BackgroundOptions) {
    this.opts = opts

    if (opts.imagePath) {
      this.processorType = ProcessorType.VIRTUAL
      this.processor = VirtualBackground(opts.imagePath)
    } else if (opts.blurRadius !== undefined) {
      this.processorType = ProcessorType.BLUR
      this.processor = BackgroundBlur(opts.blurRadius)
    } else {
      throw new Error(
        'Must provide either imagePath for virtual background or blurRadius for blur'
      )
    }
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

  async update(opts: BackgroundOptions): Promise<void> {
    const newProcessorType = opts.imagePath
      ? ProcessorType.VIRTUAL
      : ProcessorType.BLUR

    let processedOpts = opts
    if (newProcessorType !== this.processorType) {
      this.processorType = newProcessorType
      if (newProcessorType === ProcessorType.VIRTUAL) {
        this.processor.name = 'virtual-background'
        processedOpts = { ...opts, blurRadius: undefined }
      } else {
        this.processor.name = 'background-blur'
        processedOpts = { ...opts, imagePath: undefined }
      }
    }
    await this.processor.updateTransformerOptions(processedOpts)
    this.opts = processedOpts
  }

  get name() {
    return this.processor.name
  }

  get processedTrack() {
    return this.processor.processedTrack
  }

  get options() {
    return (this.processor.transformer as BackgroundTransformer).options
  }

  clone() {
    return new UnifiedBackgroundTrackProcessor(this.options || this.opts)
  }

  serialize() {
    return {
      type: this.processorType,
      options: this.options,
    }
  }
}
