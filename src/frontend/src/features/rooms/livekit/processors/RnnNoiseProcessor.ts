import { Track, TrackProcessor, ProcessorOptions } from 'livekit-client'
import { NoiseSuppressorWorklet_Name } from '@timephy/rnnoise-wasm'

// This is an example how to get the script path using Vite, may be different when using other build tools
// NOTE: `?worker&url` is important (`worker` to generate a working script, `url` to get its url to load it)
import NoiseSuppressorWorklet from '@timephy/rnnoise-wasm/NoiseSuppressorWorklet?worker&url'

export interface AudioProcessorInterface
  extends TrackProcessor<Track.Kind.Audio> {
  name: string
}

export class RnnNoiseProcessor implements AudioProcessorInterface {
  name: string = 'noise-reduction'
  processedTrack?: MediaStreamTrack

  private source?: MediaStreamTrack
  private audioContext?: AudioContext
  private sourceNode?: MediaStreamAudioSourceNode
  private destinationNode?: MediaStreamAudioDestinationNode
  private noiseSuppressionNode?: AudioWorkletNode

  constructor() {}

  async init(opts: ProcessorOptions<Track.Kind.Audio>) {
    if (!opts.track) {
      throw new Error('Track is required for audio processing')
    }

    this.source = opts.track as MediaStreamTrack
    this.audioContext = opts.audioContext as AudioContext

    await this.audioContext.audioWorklet.addModule(NoiseSuppressorWorklet)

    this.sourceNode = this.audioContext.createMediaStreamSource(
      new MediaStream([this.source])
    )

    this.noiseSuppressionNode = new AudioWorkletNode(
      this.audioContext,
      NoiseSuppressorWorklet_Name
    )

    this.destinationNode = this.audioContext.createMediaStreamDestination()

    // Connect the audio processing chain
    this.sourceNode
      .connect(this.noiseSuppressionNode)
      .connect(this.destinationNode)

    // Get the processed track
    const tracks = this.destinationNode.stream.getAudioTracks()
    if (tracks.length === 0) {
      throw new Error('No audio tracks found for processing')
    }

    this.processedTrack = tracks[0]
  }

  async restart(opts: ProcessorOptions<Track.Kind.Audio>) {
    await this.destroy()
    return this.init(opts)
  }

  async destroy() {
    // Clean up audio nodes and context
    this.sourceNode?.disconnect()
    this.noiseSuppressionNode?.disconnect()
    this.destinationNode?.disconnect()
    await this.audioContext?.close()

    this.sourceNode = undefined
    this.destinationNode = undefined
    this.audioContext = undefined
    this.source = undefined
    this.processedTrack = undefined
    this.noiseSuppressionNode = undefined
  }
}
