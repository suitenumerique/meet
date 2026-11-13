import {
  log,
  sortTrackReferences,
  updatePages,
  type TrackReferenceOrPlaceholder,
} from '@livekit/components-core'
import { Track } from 'livekit-client'

// LiveKit's track reference id changes when a placeholder gets its track;
// this key doesn't, so turning a camera on is not seen as a new tile.
const keyOf = (tile: TrackReferenceOrPlaceholder) =>
  `${tile.participant.identity}_${tile.source}`

/**
 * Orders the carousel tiles; the first `maxVisibleTiles` are the visible ones.
 *
 * This is what LiveKit's `useVisualStableUpdate` does, plus one step:
 * 1. `sortTrackReferences` decides which tiles deserve to be visible;
 * 2. `updatePages` applies that to the `previous` order with as few moves as
 *    possible: an incoming tile is swapped with the outgoing one;
 * 3. added here: within the visible tiles, the local camera goes first, then
 *    the screen shares, then the speakers that step 2 just brought in. The
 *    other tiles keep the order step 2 gave them.
 *
 * Step 2 alone leaves a new speaker wherever the evicted tile happened to be,
 * often at the bottom of the column.
 */
export function orderCarouselTiles(
  previous: TrackReferenceOrPlaceholder[],
  tracks: TrackReferenceOrPlaceholder[],
  maxVisibleTiles: number
): TrackReferenceOrPlaceholder[] {
  const sorted = sortTrackReferences(tracks)

  let stable = sorted
  try {
    stable = updatePages(previous, sorted, maxVisibleTiles)
  } catch (error) {
    log.error('Error while running updatePages(): ', error)
  }

  const previouslyVisible = new Set(
    previous.slice(0, maxVisibleTiles).map(keyOf)
  )
  const rank = (tile: TrackReferenceOrPlaceholder) => {
    if (tile.source === Track.Source.ScreenShare) return 1
    if (tile.participant.isLocal) return 0
    const justCameIn = !previouslyVisible.has(keyOf(tile))
    return justCameIn && tile.participant.isSpeaking ? 2 : 3
  }

  return [
    // Array.prototype.sort is stable: tiles of equal rank keep their order.
    ...stable.slice(0, maxVisibleTiles).sort((a, b) => rank(a) - rank(b)),
    ...stable.slice(maxVisibleTiles),
  ]
}
