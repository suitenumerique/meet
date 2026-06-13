import type { Track, TrackProcessor, ProcessorOptions } from 'livekit-client'

// Use Jitsi's approach: maintain a global AudioContext variable
// and suspend/resume it as needed to manage audio state
let audioContext: AudioContext

/**
 * Lazily load the WASM processor factory.
 *
 * '@libreaudio/la-call' pulls in a WebAssembly payload, so we defer importing
 * it until a processor is actually initialized rather than at module load.
 * The import promise is cached so repeated init() calls reuse the same module.
 */
type CreateWasmProcessor =
  (typeof import('@libreaudio/la-call'))['createWasmProcessor']

let wasmProcessorPromise: Promise<CreateWasmProcessor> | undefined

function loadWasmProcessor(): Promise<CreateWasmProcessor> {
  if (!wasmProcessorPromise) {
    wasmProcessorPromise = import('@libreaudio/la-call').then(
      (mod) => mod.createWasmProcessor
    )
  }
  return wasmProcessorPromise
}

export interface AudioProcessorInterface extends TrackProcessor<Track.Kind.Audio> {
  name: string
}

export class RnnNoiseProcessor implements AudioProcessorInterface {
  name: string = 'noise-reduction'
  processedTrack?: MediaStreamTrack

  private source?: MediaStreamTrack
  private sourceNode?: MediaStreamAudioSourceNode
  private destinationNode?: MediaStreamAudioDestinationNode
  private noiseSuppressionNode?: AudioNode

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

    this.sourceNode = audioContext.createMediaStreamSource(
      new MediaStream([this.source])
    )

    const createWasmProcessor = await loadWasmProcessor()
    this.noiseSuppressionNode = await createWasmProcessor(audioContext, {
      intensity: 90,
    })
    if (!this.noiseSuppressionNode) {
      throw new Error('Failed to create Wasm processor')
    }

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
