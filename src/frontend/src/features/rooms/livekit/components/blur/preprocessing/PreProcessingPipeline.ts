
import { PreProcessingConfig } from '..'
import { BBox, RoiCropper } from './RoiCropper'


export class PreProcessingPipeline {
  private readonly roiCropper?: RoiCropper

  constructor(cfg: PreProcessingConfig) {
    if (cfg.roiCropping?.enabled) this.roiCropper = new RoiCropper()
  }


  getNextCropBbox(
    currentRgba?: Uint8ClampedArray,
    rgbaW?: number,
    rgbaH?: number
  ): BBox | null {
    return this.roiCropper?.getNextCropBbox(currentRgba, rgbaW, rgbaH) ?? null
  }

  
  applyAfterInference(
    mask: Float32Array,
    maskW: number,
    maskH: number,
    usedBbox: BBox | null
  ): Float32Array {
    if (!this.roiCropper || !usedBbox) return mask

    const full = this.roiCropper.remapMask(
      mask,
      maskW,
      maskH,
      usedBbox,
      maskW,
      maskH
    )
    this.roiCropper.updateWithMask(full, maskW, maskH)
    return full
  }
}
