import { Track, TrackProcessor, ProcessorOptions } from 'livekit-client'
import { NoiseSuppressorWorklet_Name } from '@timephy/rnnoise-wasm'

// This is an example how to get the script path using Vite, may be different when using other build tools
// NOTE: `?worker&url` is important (`worker` to generate a working script, `url` to get its url to load it)
import NoiseSuppressorWorklet from '@timephy/rnnoise-wasm/NoiseSuppressorWorklet?worker&url'

// Use Jitsi's approach: maintain a global AudioContext variable
// and suspend/resume it as needed to manage audio state
let audioContext: AudioContext

export interface AudioProcessorInterface
  extends TrackProcessor<Track.Kind.Audio> {
  name: string
}

export class RnnNoiseProcessor implements AudioProcessorInterface {
  name: string = 'noise-reduction'
  processedTrack?: MediaStreamTrack

  private source?: MediaStreamTrack
  private sourceNode?: MediaStreamAudioSourceNode
  private destinationNode?: MediaStreamAudioDestinationNode
  private noiseSuppressionNode?: AudioWorkletNode

  constructor() {}

  async init(opts: ProcessorOptions<Track.Kind.Audio>) {
    if (!opts.track) {
      throw new Error('Track is required for audio processing')
    }

    this.source = opts.track as MediaStreamTrack

    if (!audioContext) {
      audioContext = new AudioContext()
    } else {
      await audioContext.resume()
    }

    await audioContext.audioWorklet.addModule(NoiseSuppressorWorklet)

    this.sourceNode = audioContext.createMediaStreamSource(
      new MediaStream([this.source])
    )

    this.noiseSuppressionNode = new AudioWorkletNode(
      audioContext,
      NoiseSuppressorWorklet_Name
    )

    this.destinationNode = audioContext.createMediaStreamDestination()

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

    /**
     * Audio Context Lifecycle Management
     *
     * We prefer suspending the audio context rather than destroying and recreating it
     * to avoid memory leaks in WebAssembly-based audio processing.
     *
     * Issue: When an AudioContext containing WebAssembly modules is destroyed,
     * the WASM resources are not properly garbage collected. This causes:
     * - Retained JavaScript VM instances
     * - Growing memory consumption over multiple create/destroy cycles
     * - Potential performance degradation
     *
     * Solution: Use suspend() and resume() methods instead of close() to maintain
     * the same context instance while controlling audio processing state.
     */
    await audioContext.suspend()

    this.sourceNode = undefined
    this.destinationNode = undefined
    this.source = undefined
    this.processedTrack = undefined
    this.noiseSuppressionNode = undefined
  }
}
