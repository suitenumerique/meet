/**
 * Region-of-Interest (ROI) cropper with dead-zone stabilization.
 *
 * Called by: PreProcessingPipeline (wraps RoiCropper in its thin facade).
 *
 * Pipeline role: Optional pre-inference step that narrows the segmenter input
 * to a stabilized bounding box around the person. Per-frame call order:
 *   1. getNextCropBbox()  — returns the bbox used to crop the video snapshot
 *   2. model.segment()   — runs on the cropped ImageData
 *   3. remapMask()        — maps the crop-space mask back to full-frame space
 *   4. updateWithMask()   — updates the stable bbox for the next frame
 * Motion outside the current bbox triggers a full-frame reset so sudden
 * scene changes don't trap the crop on the wrong region.
 */
const DEAD_ZONE_POSITION = 0.03
const DEAD_ZONE_SIZE = 0.015
const BBOX_PADDING = 0.08
const MASK_THRESHOLD = 0.5
const MOTION_DIFF_THRESHOLD = 25
const MOTION_PIXEL_RATIO = 1 / 16
const MOTION_CHECK_INTERVAL = 30
const EXPANSION_COOLDOWN_FRAMES = 30

export interface BBox {
  x: number // normalised left edge [0, 1]
  y: number // normalised top edge  [0, 1]
  width: number // normalised width     [0, 1]
  height: number // normalised height    [0, 1]
}

const FULL_FRAME: BBox = { x: 0, y: 0, width: 1, height: 1 }

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/** Scan the mask and return the tightest bbox around pixels above threshold,
 *  expanded by BBOX_PADDING, clamped to [0, 1]. Returns null if no pixel qualifies. */
export function computePersonBbox(
  mask: Float32Array,
  maskW: number,
  maskH: number
): BBox | null {
  let minX = maskW,
    maxX = -1,
    minY = maskH,
    maxY = -1

  for (let y = 0; y < maskH; y++) {
    for (let x = 0; x < maskW; x++) {
      if (mask[y * maskW + x] > MASK_THRESHOLD) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < 0) return null

  const nx = minX / maskW
  const ny = minY / maskH
  const nw = (maxX - minX + 1) / maskW
  const nh = (maxY - minY + 1) / maskH

  return {
    x: clamp(nx - BBOX_PADDING, 0, 1),
    y: clamp(ny - BBOX_PADDING, 0, 1),
    width: clamp(nw + 2 * BBOX_PADDING, 0, 1 - clamp(nx - BBOX_PADDING, 0, 1)),
    height: clamp(nh + 2 * BBOX_PADDING, 0, 1 - clamp(ny - BBOX_PADDING, 0, 1)),
  }
}

/** Stabilise a raw bbox against the current stable bbox using a dead zone + EMA. */
export function stabilizeBbox(current: BBox, next: BBox): BBox {
  const cxCurr = current.x + current.width / 2
  const cyCurr = current.y + current.height / 2
  const cxNext = next.x + next.width / 2
  const cyNext = next.y + next.height / 2

  const positionMoved =
    Math.abs(cxNext - cxCurr) > DEAD_ZONE_POSITION ||
    Math.abs(cyNext - cyCurr) > DEAD_ZONE_POSITION
  const sizeMoved =
    Math.abs(next.width - current.width) > DEAD_ZONE_SIZE ||
    Math.abs(next.height - current.height) > DEAD_ZONE_SIZE

  if (!positionMoved && !sizeMoved) return current

  return {
    x: next.x,
    y: next.y,
    width: next.width,
    height: next.height,
  }
}

/** Bilinear resize of a Float32 single-channel image into a pre-allocated destination. */
function resizeFloat32Into(
  src: Float32Array,
  srcW: number,
  srcH: number,
  dst: Float32Array,
  dstW: number,
  dstH: number
): void {
  const scaleX = srcW / dstW
  const scaleY = srcH / dstH

  for (let dy = 0; dy < dstH; dy++) {
    const sy = (dy + 0.5) * scaleY - 0.5
    const sy0 = Math.floor(sy)
    const sy1 = sy0 + 1
    const fy = sy - sy0
    const iy0 = sy0 < 0 ? 0 : sy0 >= srcH ? srcH - 1 : sy0
    const iy1 = sy1 < 0 ? 0 : sy1 >= srcH ? srcH - 1 : sy1

    for (let dx = 0; dx < dstW; dx++) {
      const sx = (dx + 0.5) * scaleX - 0.5
      const sx0 = Math.floor(sx)
      const sx1 = sx0 + 1
      const fx = sx - sx0
      const ix0 = sx0 < 0 ? 0 : sx0 >= srcW ? srcW - 1 : sx0
      const ix1 = sx1 < 0 ? 0 : sx1 >= srcW ? srcW - 1 : sx1

      const v =
        (1 - fy) *
          ((1 - fx) * src[iy0 * srcW + ix0] + fx * src[iy0 * srcW + ix1]) +
        fy * ((1 - fx) * src[iy1 * srcW + ix0] + fx * src[iy1 * srcW + ix1])
      dst[dy * dstW + dx] = v
    }
  }
}

/**
 * ROI Cropper — maintains a stabilised bounding box of the person across frames.
 *
 * Per-frame call order in AdvancedMattingProcessor:
 *   1. bbox = roiCropper.getNextCropBbox()         (used by sizeSource to crop the video)
 *   2. model.segment(croppedFrame)                 → maskInCropSpace
 *   3. fullMask = roiCropper.remapMask(maskInCropSpace, maskW, maskH, bbox)
 *   4. roiCropper.updateWithMask(fullMask, maskW, maskH)
 */
export class RoiCropper {
  private currentBbox: BBox = { ...FULL_FRAME }
  private frameCounter = 0
  private prevLuma: Uint8Array | null = null
  private cooldownFrames = 0

  // Reusable buffers — avoids per-frame Float32Array allocations in remapMask/resizeFloat32.
  private _resizeBuf: Float32Array | null = null
  private _fullBuf: Float32Array | null = null

  /** Returns the stabilised bbox to use when extracting the model input for this frame. */
  getNextCropBbox(
    currentRgba?: Uint8ClampedArray,
    rgbaW?: number,
    rgbaH?: number
  ): BBox {
    this.frameCounter++

    if (this.cooldownFrames > 0) {
      this.cooldownFrames--
      return { ...this.currentBbox }
    }

    if (this.frameCounter % MOTION_CHECK_INTERVAL === 0) {
      const motionDetected =
        !!currentRgba &&
        !!rgbaW &&
        !!rgbaH &&
        !!this.prevLuma &&
        this._hasMotionOutsideBbox(currentRgba, rgbaW, rgbaH, this.currentBbox)
      this._updatePrevLuma(currentRgba, rgbaW, rgbaH)
      if (motionDetected) {
        this.currentBbox = { ...FULL_FRAME }
        this.cooldownFrames = EXPANSION_COOLDOWN_FRAMES
        return { ...FULL_FRAME }
      }
    }

    return { ...this.currentBbox }
  }

  private _hasMotionOutsideBbox(
    rgba: Uint8ClampedArray,
    w: number,
    h: number,
    bbox: BBox
  ): boolean {
    const bboxX0 = Math.floor(bbox.x * w)
    const bboxY0 = Math.floor(bbox.y * h)
    const bboxX1 = Math.ceil((bbox.x + bbox.width) * w)
    const bboxY1 = Math.ceil((bbox.y + bbox.height) * h)
    const prev = this.prevLuma!
    let changedPixels = 0

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x >= bboxX0 && x < bboxX1 && y >= bboxY0 && y < bboxY1) continue
        const i = (y * w + x) * 4
        const luma = (rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3
        if (Math.abs(luma - prev[y * w + x]) > MOTION_DIFF_THRESHOLD) {
          changedPixels++
        }
      }
    }

    const outsidePixels = w * h - (bboxX1 - bboxX0) * (bboxY1 - bboxY0)
    return outsidePixels > 0 && changedPixels / outsidePixels > MOTION_PIXEL_RATIO
  }

  private _updatePrevLuma(
    rgba?: Uint8ClampedArray,
    w?: number,
    h?: number
  ): void {
    if (!rgba || !w || !h) return
    const n = w * h
    if (!this.prevLuma || this.prevLuma.length !== n) {
      this.prevLuma = new Uint8Array(n)
    }
    for (let i = 0; i < n; i++) {
      const j = i * 4
      this.prevLuma[i] = (rgba[j] + rgba[j + 1] + rgba[j + 2]) / 3
    }
  }

  /**
   * Remap a mask that lives in crop-bbox space back to the full-frame mask space.
   * Creates a zero-filled fullW×fullH array and pastes the resized crop mask at
   * the correct position.
   */
  remapMask(
    cropMask: Float32Array,
    cropMaskW: number,
    cropMaskH: number,
    usedBbox: BBox,
    fullW: number,
    fullH: number
  ): Float32Array {
    const fullLen = fullW * fullH
    if (!this._fullBuf || this._fullBuf.length !== fullLen) {
      this._fullBuf = new Float32Array(fullLen)
    }
    const full = this._fullBuf
    full.fill(0)

    const dstX = Math.round(usedBbox.x * fullW)
    const dstY = Math.round(usedBbox.y * fullH)
    const dstW = Math.round(usedBbox.width * fullW)
    const dstH = Math.round(usedBbox.height * fullH)

    if (dstW <= 0 || dstH <= 0) return full

    const resizeLen = dstW * dstH
    if (!this._resizeBuf || this._resizeBuf.length !== resizeLen) {
      this._resizeBuf = new Float32Array(resizeLen)
    }
    resizeFloat32Into(
      cropMask,
      cropMaskW,
      cropMaskH,
      this._resizeBuf,
      dstW,
      dstH
    )

    for (let y = 0; y < dstH; y++) {
      const fy = dstY + y
      if (fy < 0 || fy >= fullH) continue
      for (let x = 0; x < dstW; x++) {
        const fx = dstX + x
        if (fx < 0 || fx >= fullW) continue
        full[fy * fullW + fx] = this._resizeBuf[y * dstW + x]
      }
    }

    return full
  }

  /** Update internal state from the full-frame mask produced this frame. */
  updateWithMask(fullMask: Float32Array, maskW: number, maskH: number): void {
    const raw = computePersonBbox(fullMask, maskW, maskH)
    if (!raw) {
      // No person detected — keep current bbox so the crop doesn't jump to full frame.
      return
    }
    this.currentBbox = stabilizeBbox(this.currentBbox, raw)
  }

  reset(): void {
    this.currentBbox = { ...FULL_FRAME }
    this.frameCounter = 0
    this.prevLuma = null
    this.cooldownFrames = 0
    this._resizeBuf = null
    this._fullBuf = null
  }
}
