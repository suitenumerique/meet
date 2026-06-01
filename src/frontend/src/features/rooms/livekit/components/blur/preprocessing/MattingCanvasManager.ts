/**
 * Manages the off-screen canvases used by the segmenter loop.
 *
 * Called by: AdvancedMattingProcessor (owns the instance), SegmenterLoopRunner
 * (consumes captureSnapshot, sizeSource, getMotionFrameRgba).
 *
 * Pipeline role: Creates and maintains three canvases:
 *   - snapshot canvas  (video res)   — atomic reference frame for a pipeline tick
 *   - motion canvas    (128×72)      — down-sampled luma for RoiCropper motion detection
 *   - segmentation canvas (procW×procH) — model input after optional crop + resize
 * Also supplies the all-ones passthrough mask used before the first real
 * segmentation result is available.
 */
import { BBox } from './RoiCropper'

const SEGMENTATION_MASK_CANVAS_ID = 'background-blur-local-segmentation'

export class MattingCanvasManager {
  private _snapshotCanvas?: HTMLCanvasElement
  private _snapshotCanvasCtx?: CanvasRenderingContext2D

  private _motionCanvas?: HTMLCanvasElement
  private _motionCanvasCtx?: CanvasRenderingContext2D

  private _segmentationMaskCanvasCtx?: CanvasRenderingContext2D

  private _passthroughMask?: Float32Array

  public static readonly MOTION_W = 128
  public static readonly MOTION_H = 72

  /**
   * Ensures the snapshot canvas exists and matches the current video size,
   * then draws the current video frame into it. Synchronous → defines the
   * atomic instant from which the segmenter input and the renderer bitmap
   * are both derived.
   */
  captureSnapshot(videoElement: HTMLVideoElement): HTMLCanvasElement | null {
    if (videoElement.videoWidth === 0) return null
    const vw = videoElement.videoWidth
    const vh = videoElement.videoHeight
    if (
      !this._snapshotCanvas ||
      this._snapshotCanvas.width !== vw ||
      this._snapshotCanvas.height !== vh
    ) {
      const canvas = this._snapshotCanvas ?? document.createElement('canvas')
      canvas.width = vw
      canvas.height = vh
      this._snapshotCanvas = canvas
      this._snapshotCanvasCtx = canvas.getContext('2d', {
        willReadFrequently: false,
      }) as CanvasRenderingContext2D
    }
    this._snapshotCanvasCtx!.drawImage(videoElement, 0, 0, vw, vh)
    return this._snapshotCanvas
  }

  getMotionFrameRgba(): Uint8ClampedArray | null {
    if (!this._snapshotCanvas) return null
    const mw = MattingCanvasManager.MOTION_W
    const mh = MattingCanvasManager.MOTION_H
    if (!this._motionCanvas) {
      const canvas = document.createElement('canvas')
      canvas.width = mw
      canvas.height = mh
      this._motionCanvas = canvas
      this._motionCanvasCtx = canvas.getContext('2d', {
        willReadFrequently: true,
      }) as CanvasRenderingContext2D
    }
    this._motionCanvasCtx!.drawImage(this._snapshotCanvas, 0, 0, mw, mh)
    return this._motionCanvasCtx!.getImageData(0, 0, mw, mh).data
  }

  /**
   * Downsample a source image (canvas or video) into the proc-res segmentation
   * canvas and read it back as ImageData. The source's natural dimensions are
   * read from `width`/`height` (canvas) or `videoWidth`/`videoHeight` (video).
   */
  sizeSource(
    source: HTMLCanvasElement | HTMLVideoElement,
    processingW: number,
    processingH: number,
    cropBbox?: BBox | null
  ): ImageData {
    this.ensureMaskCanvas(processingW, processingH)

    const vw =
      (source as HTMLVideoElement).videoWidth ??
      (source as HTMLCanvasElement).width
    const vh =
      (source as HTMLVideoElement).videoHeight ??
      (source as HTMLCanvasElement).height
    const sx = cropBbox ? Math.round(cropBbox.x * vw) : 0
    const sy = cropBbox ? Math.round(cropBbox.y * vh) : 0
    const sw = cropBbox ? Math.round(cropBbox.width * vw) : vw
    const sh = cropBbox ? Math.round(cropBbox.height * vh) : vh

    this._segmentationMaskCanvasCtx!.drawImage(
      source,
      sx,
      sy,
      sw,
      sh,
      0,
      0,
      processingW,
      processingH
    )
    return this._segmentationMaskCanvasCtx!.getImageData(
      0,
      0,
      processingW,
      processingH
    )
  }

  ensureMaskCanvas(processingW: number, processingH: number): HTMLCanvasElement {
    let canvas = document.querySelector(
      `#${SEGMENTATION_MASK_CANVAS_ID}`
    ) as HTMLCanvasElement | null

    if (!canvas) {
      canvas = this.createCanvas(
        SEGMENTATION_MASK_CANVAS_ID,
        processingW,
        processingH
      )
    } else {
      if (canvas.width !== processingW || canvas.height !== processingH) {
        canvas.setAttribute('width', '' + processingW)
        canvas.setAttribute('height', '' + processingH)
      }
    }
    if (!this._segmentationMaskCanvasCtx || this._segmentationMaskCanvasCtx.canvas !== canvas) {
      this._segmentationMaskCanvasCtx = canvas.getContext('2d', {
        willReadFrequently: true,
      })!
    }
    return canvas
  }

  getPassthroughMask(w: number, h: number): Float32Array {
    if (!this._passthroughMask || this._passthroughMask.length !== w * h) {
      this._passthroughMask = new Float32Array(w * h).fill(1)
    }
    return this._passthroughMask
  }

  createCanvas(id: string, width: number, height: number): HTMLCanvasElement {
    const el = document.createElement('canvas')
    el.setAttribute('id', id)
    el.setAttribute('width', '' + width)
    el.setAttribute('height', '' + height)
    return el
  }

  destroy() {
    this._snapshotCanvas = undefined
    this._snapshotCanvasCtx = undefined
    this._motionCanvas = undefined
    this._motionCanvasCtx = undefined
    this._segmentationMaskCanvasCtx = undefined
    this._passthroughMask = undefined
  }
}
