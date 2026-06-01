/**
 * Startup benchmark that measures segmenter inference latency and selects the
 * appropriate model and frame-skip setting for the current device.
 *
 * Called by: AdvancedMattingProcessor._createAndCalibrateSegmenter() — once
 * per session after the initial segmenter loads.
 *
 * Pipeline role: Runs 5 warm-up + 15 timed inference passes on real video
 * frames and computes the p75 latency. Decision table:
 *   - Multiclass p75 < 25 ms  → keep multiclass, skip=1 (30 fps inference)
 *   - Multiclass p75 ≤ 50 ms  → keep multiclass, skip=2 (15 fps inference)
 *   - Multiclass p75 > 50 ms  → switch to landscape model
 * Landscape is further benchmarked for skip=1 vs skip=2. Intermediate results
 * are published as FrameMaskPairs so the render loop shows progress during
 * warmup.
 */
import { Segmenter, probeMediapipeDelegate } from './Segmenter'
import { debugLog, debugWarn } from '../debug'

export class SegmenterBenchmarker {
  /**
   * Common measurement protocol: 5 warm-up runs (displayed but not timed) +
   * 15 timed runs on fresh video frames. Returns p75 latency in ms, or null
   * if a warm-up run throws (caller decides how to handle).
   * Each result is published via onPairCreated so the render loop shows the
   * effect building up during the benchmark.
   */
  static async measureInferenceP75(
    seg: Segmenter,
    videoElement: HTMLVideoElement | undefined,
    onPairCreated: (mask: Float32Array, source: ImageBitmap, captureTime: number) => void,
    isDestroyed: () => boolean
  ): Promise<number | null> {
    const width = seg.inputSize.width
    const height = seg.inputSize.height

    const benchCanvas = document.createElement('canvas')
    benchCanvas.width = width
    benchCanvas.height = height
    const ctx = benchCanvas.getContext('2d')
    if (!ctx) return null

    const hasRealFrame = (): boolean =>
      !!(
        videoElement &&
        videoElement.readyState >= 2 &&
        videoElement.videoWidth > 0
      )

    const captureFrame = (): ImageData => {
      if (hasRealFrame()) ctx.drawImage(videoElement!, 0, 0, width, height)
      return ctx.getImageData(0, 0, width, height)
    }

    const publishFrame = async (mask: Float32Array): Promise<void> => {
      if (!hasRealFrame()) return
      const now = performance.now()
      let bitmap: ImageBitmap
      try {
        bitmap = await createImageBitmap(benchCanvas, {
          imageOrientation: 'flipY',
        })
      } catch {
        return
      }
      if (isDestroyed()) {
        bitmap.close()
        return
      }
      onPairCreated(mask, bitmap, now)
    }

    const WARMUP = 5
    for (let i = 0; i < WARMUP; i++) {
      if (isDestroyed()) return null
      const frame = captureFrame()
      const mask = await seg.segment(frame, performance.now()) // throws → caller handles
      await publishFrame(mask)
    }

    const RUNS = 15
    const samples: number[] = []
    for (let i = 0; i < RUNS; i++) {
      if (isDestroyed()) return null
      const frame = captureFrame()
      const start = performance.now()
      const mask = await seg.segment(frame, performance.now())
      samples.push(performance.now() - start)
      await publishFrame(mask)
    }

    samples.sort((a, b) => a - b)
    return samples[Math.floor(RUNS * 0.75)] // p75: index 11 of 15
  }

  static async benchmarkSegmenter(
    seg: Segmenter,
    videoElement: HTMLVideoElement | undefined,
    onPairCreated: (mask: Float32Array, source: ImageBitmap, captureTime: number) => void,
    isDestroyed: () => boolean
  ): Promise<'landscape' | 'multiclass_skip1' | 'multiclass_skip2'> {
    try {
      const probe = await probeMediapipeDelegate()
      if (probe === 'CPU') {
        debugWarn('[AMP BENCHMARK] Skipped: CPU delegate detected. Falling back to Landscape.')
        return 'landscape'
      }

      let p75: number | null
      try {
        p75 = await this.measureInferenceP75(seg, videoElement, onPairCreated, isDestroyed)
      } catch (e) {
        debugWarn('[AMP BENCHMARK] Warm-up/Inference run failed. Falling back to Landscape.', e)
        return 'landscape'
      }
      if (p75 === null || isDestroyed()) return 'landscape'

      let result: 'landscape' | 'multiclass_skip1' | 'multiclass_skip2'
      let resultVal: string
      if (p75 < 25) {
        result = 'multiclass_skip1'
        resultVal = 'PASS — Multiclass 30fps (skip=1)'
      } else if (p75 <= 50) {
        result = 'multiclass_skip2'
        resultVal = 'PASS — Multiclass 15fps (skip=2)'
      } else {
        result = 'landscape'
        resultVal = 'FAIL — Landscape fallback'
      }

      debugLog(`[AMP BENCHMARK] Multiclass Performance: P75 Latency = ${p75.toFixed(2)} ms. Result = ${resultVal}`)
      return result
    } catch (e) {
      debugWarn('[AMP BENCHMARK] Error during Multiclass benchmark. Falling back to Landscape.', e)
      return 'landscape'
    }
  }

  static async benchmarkLandscapeSkip(
    seg: Segmenter,
    videoElement: HTMLVideoElement | undefined,
    onPairCreated: (mask: Float32Array, source: ImageBitmap, captureTime: number) => void,
    isDestroyed: () => boolean
  ): Promise<'skip1' | 'skip2'> {
    try {
      let p75: number | null
      try {
        p75 = await this.measureInferenceP75(seg, videoElement, onPairCreated, isDestroyed)
      } catch (e) {
        debugWarn('[AMP BENCHMARK] Landscape warm-up failed. Defaulting to skip=2.', e)
        return 'skip2'
      }
      if (p75 === null || isDestroyed()) return 'skip2'

      const result: 'skip1' | 'skip2' = p75 < 25 ? 'skip1' : 'skip2'
      const resultVal =
        result === 'skip1'
          ? 'PASS — 30fps (skip=1)'
          : 'FALLBACK — 15fps (skip=2)'

      debugLog(`[AMP BENCHMARK] Landscape Performance: P75 Latency = ${p75.toFixed(2)} ms. Result = ${resultVal}`)
      return result
    } catch (e) {
      debugWarn('[AMP BENCHMARK] Landscape benchmark error. Defaulting to skip=2.', e)
      return 'skip2'
    }
  }
}
