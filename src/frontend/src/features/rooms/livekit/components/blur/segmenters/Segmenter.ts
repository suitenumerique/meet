/**
 * Base interface and shared utilities for the segmenter subsystem.
 *
 * Called by: LandscapeSegmenter, MulticlassSegmenter (implement Segmenter),
 * segmenters/index.ts and SegmenterBenchmarker (use probeMediapipeDelegate),
 * SegmenterLoopRunner (depends on the Segmenter interface).
 *
 * Pipeline role: Defines the uniform segment() contract so the rest of the
 * pipeline is decoupled from the choice of model. Caches the MediaPipe WASM
 * bundle (getMediapipeFileset) and the session-level GPU/CPU delegate probe
 * (probeMediapipeDelegate) so they are loaded only once regardless of how
 * many segmenter instances are created.
 */
import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision'

type MediapipeFileset = Awaited<
  ReturnType<typeof FilesetResolver.forVisionTasks>
>

/**
 * Segmenter: abstracts the segmentation model behind a uniform interface.
 * Each implementation must return a Float32Array mask with values in [0, 1],
 * where 1 = person, 0 = background.
 */
export interface Segmenter {
  init(): Promise<void>
  segment(imageData: ImageData, timestampMs: number): Promise<Float32Array>
  destroy(): void
  readonly inputSize: { width: number; height: number }
}

const MEDIAPIPE_WASM_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'

let _filesetPromise: Promise<MediapipeFileset> | null = null

/** Cache the FilesetResolver across segmenter instances — it loads ~1MB of WASM. */
export function getMediapipeFileset(): Promise<MediapipeFileset> {
  if (!_filesetPromise) {
    _filesetPromise = FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL).catch(
      (e) => {
        _filesetPromise = null
        throw e
      }
    )
  }
  return _filesetPromise
}

// Set to true to bypass the GPU probe and force MediaPipe to run on CPU.
// Useful for debugging: lets you check if the matting pipeline works at all
// without GPU acceleration. Expect ~80–150 ms/frame → visible lag at 256².
const FORCE_CPU_DELEGATE = false

let _delegateProbe: Promise<'GPU' | 'CPU'> | null = null

/**
 * Probe MediaPipe's GPU delegate by really trying to spin up an ImageSegmenter.
 * Falls back to CPU on failure. Memoised for the session.
 *
 * Replaces the previous UA-sniff that blanket-disabled GPU on Safari — Safari ≥ 17
 * supports the GPU delegate, and the user-facing impact of forcing CPU is severe
 * (80–150 ms per frame at 256² → queue saturation → frames look like passthrough).
 */
export function probeMediapipeDelegate(): Promise<'GPU' | 'CPU'> {
  if (_delegateProbe) return _delegateProbe
  if (FORCE_CPU_DELEGATE) {
    _delegateProbe = Promise.resolve('CPU')
    return _delegateProbe
  }
  _delegateProbe = (async () => {
    // Quick WebGL2 check first — without it the GPU delegate has nowhere to run.
    let webgl2Available = false
    try {
      const c = document.createElement('canvas')
      webgl2Available = !!c.getContext('webgl2')
    } catch {
      webgl2Available = false
    }
    if (!webgl2Available) return 'CPU'

    try {
      const fileset = await getMediapipeFileset()
      // Use a small/cheap model just to test the delegate. The Landscape model
      // is the smallest of the two we ship.
      const probe = await ImageSegmenter.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      })
      probe.close()
      return 'GPU'
    } catch (e) {
      console.info('[matting:MEDIAPIPE_GPU_FALLBACK_TO_CPU]', e instanceof Error ? e.message : String(e))
      return 'CPU'
    }
  })()
  return _delegateProbe
}
