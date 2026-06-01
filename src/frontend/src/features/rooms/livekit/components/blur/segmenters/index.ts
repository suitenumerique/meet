/**
 * Factory module for the segmenter subsystem.
 *
 * Called by: AdvancedMattingProcessor._createAndCalibrateSegmenter().
 *
 * Pipeline role: Maps SegmentationModel enum values to concrete Segmenter
 * implementations. Also re-exports the Segmenter interface and the
 * probeMediapipeDelegate utility so callers need only import from this module.
 */
import { SegmentationModel } from '..'
import { LandscapeSegmenter } from './LandscapeSegmenter'
import { MulticlassSegmenter } from './MulticlassSegmenter'
import { Segmenter } from './Segmenter'

export type { Segmenter } from './Segmenter'
export { probeMediapipeDelegate } from './Segmenter'

export function createSegmenter(model?: SegmentationModel): Segmenter {
  if (model === SegmentationModel.MULTICLASS) {
    return new MulticlassSegmenter()
  }
  return new LandscapeSegmenter()
}
