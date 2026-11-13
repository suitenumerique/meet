import type { TrackReferenceOrPlaceholder } from '@livekit/components-core'
import { useRef } from 'react'
import { orderCarouselTiles } from '../utils/orderCarouselTiles'

/**
 * Carousel counterpart of LiveKit's `useVisualStableUpdate`: same sort, same
 * stable update, but screen shares and new speakers end up at the top. See
 * `orderCarouselTiles`.
 *
 * Like `useVisualStableUpdate`, it only reorders when its host renders.
 */
export function useCarouselTiles(
  tracks: TrackReferenceOrPlaceholder[],
  maxVisibleTiles: number
) {
  const previous = useRef<TrackReferenceOrPlaceholder[]>([])
  previous.current = orderCarouselTiles(
    previous.current,
    tracks,
    maxVisibleTiles
  )
  return previous.current
}
