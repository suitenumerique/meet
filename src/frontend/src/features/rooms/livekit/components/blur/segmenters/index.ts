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
