import { ProcessorOptions, Track } from 'livekit-client'
import {
  BackgroundBlur,
  ProcessorWrapper,
  VirtualBackground,
} from '@livekit/track-processors'
import { ProcessorConfig, BackgroundProcessorInterface, ProcessorType } from '.'

export class UnifiedBackgroundTrackProcessor implements BackgroundProcessorInterface {
  processor: ProcessorWrapper<{ imagePath?: string; blurRadius?: number }>
  opts: ProcessorConfig
  processorType: ProcessorType

  constructor(opts: ProcessorConfig) {
    this.opts = opts

    if (opts.type === 'virtual') {
      this.processorType = ProcessorType.VIRTUAL
      this.processor = VirtualBackground(opts.imagePath)
    } else if (opts.type === 'blur') {
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

  async update(opts: ProcessorConfig): Promise<void> {
    this.opts = opts

    const newProcessorType =
      opts.type === 'virtual' ? ProcessorType.VIRTUAL : ProcessorType.BLUR

    if (newProcessorType !== this.processorType) {
      this.processorType = newProcessorType
      if (newProcessorType === ProcessorType.VIRTUAL) {
        this.processor.name = 'virtual-background'
      } else {
        this.processor.name = 'background-blur'
      }
    }
    await this.processor.updateTransformerOptions(
      opts as { imagePath?: string; blurRadius?: number }
    )
  }

  get name() {
    return this.processor.name
  }

  get processedTrack() {
    return this.processor.processedTrack
  }

  get options() {
    return this.opts
  }
}
