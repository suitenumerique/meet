/**
 * Thin facade that orchestrates pre-processing filters applied around the
 * segmentation model inference step.
 *
 * Called by: AdvancedMattingProcessor._applyRendererConfig() (creates it when
 * roiCropping is enabled), SegmenterLoopRunner (calls getNextCropBbox and
 * applyAfterInference each frame).
 *
 * Pipeline role: Sits between the canvas snapshot and the segmenter. Currently
 * wraps a single filter (RoiCropper): getNextCropBbox() is called before
 * sizeSource() to crop the model input, and applyAfterInference() is called
 * after segment() to remap the crop-space mask back to full-frame space and
 * update the stable bbox for the next frame.
 */
import { PreProcessingConfig } from '..'
import { BBox, RoiCropper } from './RoiCropper'

/**
 Orchestrates pre-processing filters applied to the raw video frame
 before (and surrounding) the segmentation model.
 Right now, it only is a thin wrapper around RoiCropper. 
*/
export class PreProcessingPipeline {
  private roiCropper?: RoiCropper

  constructor(cfg: PreProcessingConfig) {
    if (cfg.roiCropping?.enabled) this.roiCropper = new RoiCropper()
  }

  /**
   * Returns the bbox to use when extracting the model input from the full-resolution
   * video frame. Must be called before sizeSource() each frame.
   * Returns null when no spatial crop is needed (full frame).
   */
  getNextCropBbox(
    currentRgba?: Uint8ClampedArray,
    rgbaW?: number,
    rgbaH?: number
  ): BBox | null {
    return this.roiCropper?.getNextCropBbox(currentRgba, rgbaW, rgbaH) ?? null
  }

  /**
   * Post-inference step: remap a crop-space mask back to full-frame space and update
   * any stateful preprocessors (e.g. RoiCropper's internal bbox state).
   *
   * If no spatial crop was active this frame (bbox is null / full frame), the mask is
   * returned unchanged.
   *
   * @param mask      Float32Array from the segmenter, in crop-bbox space
   * @param maskW     Width of that mask (= model input width)
   * @param maskH     Height of that mask (= model input height)
   * @param usedBbox  The bbox that was used for this frame's crop (from getNextCropBbox)
   */
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
