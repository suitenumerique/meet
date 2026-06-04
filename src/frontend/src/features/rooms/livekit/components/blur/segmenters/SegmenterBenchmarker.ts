import { Segmenter, probeMediapipeDelegate } from './Segmenter'

export class SegmenterBenchmarker {
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
        return 'landscape'
      }

      let p75: number | null
      try {
        p75 = await this.measureInferenceP75(seg, videoElement, onPairCreated, isDestroyed)
      } catch {
        return 'landscape'
      }
      if (p75 === null || isDestroyed()) return 'landscape'

      if (p75 < 25) return 'multiclass_skip1'
      if (p75 <= 50) return 'multiclass_skip2'
      return 'landscape'
    } catch {
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
      } catch {
        return 'skip2'
      }
      if (p75 === null || isDestroyed()) return 'skip2'

      return p75 < 25 ? 'skip1' : 'skip2'
    } catch {
      return 'skip2'
    }
  }
}
