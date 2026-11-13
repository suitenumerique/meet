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

/** When the participant raised their hand, if it is still raised. */
const handRaisedAt = (tile: TrackReferenceOrPlaceholder) => {
  if (tile.source !== Track.Source.Camera) return undefined
  const time = Date.parse(tile.participant.attributes.handRaisedAt ?? '')
  return Number.isNaN(time) ? undefined : time
}

/**
 * LiveKit's sort knows nothing about raised hands. This moves them right
 * after the tiles that must stay ahead (local camera, screen shares, whoever
 * is speaking now), first raised first, so they are among the first tiles
 * picked as visible for as long as the hand is up.
 */
const sortWithRaisedHands = (tracks: TrackReferenceOrPlaceholder[]) => {
  const rank = (tile: TrackReferenceOrPlaceholder) => {
    const { isLocal, isSpeaking } = tile.participant
    if (isLocal || isSpeaking || tile.source === Track.Source.ScreenShare) {
      return 0
    }
    return handRaisedAt(tile) === undefined ? 2 : 1
  }
  return sortTrackReferences(tracks).sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b)
    // Equal ranks keep LiveKit's order, except raised hands: first come first.
    return rank(a) === 1 ? handRaisedAt(a)! - handRaisedAt(b)! : 0
  })
}

/**
 * Orders the carousel tiles; the first `maxVisibleTiles` are the visible ones.
 *
 * This is what LiveKit's `useVisualStableUpdate` does, plus one step:
 * 1. `sortTrackReferences` decides which tiles deserve to be visible, with
 *    raised hands added to it, see `sortWithRaisedHands`;
 * 2. `updatePages` applies that to the `previous` order with as few moves as
 *    possible: an incoming tile is swapped with the outgoing one;
 * 3. added here: within the visible tiles, the local camera goes first, then
 *    the screen shares, then the speakers and raised hands that step 2 just
 *    brought in. The other tiles keep the order step 2 gave them.
 *
 * Step 2 alone leaves an incoming tile wherever the evicted one happened to
 * be, often at the bottom of the column.
 */
export function orderCarouselTiles(
  previous: TrackReferenceOrPlaceholder[],
  tracks: TrackReferenceOrPlaceholder[],
  maxVisibleTiles: number
): TrackReferenceOrPlaceholder[] {
  const sorted = sortWithRaisedHands(tracks)

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
    const wantsAttention =
      tile.participant.isSpeaking || handRaisedAt(tile) !== undefined
    return justCameIn && wantsAttention ? 2 : 3
  }

  return [
    // Array.prototype.sort is stable: tiles of equal rank keep their order.
    ...stable.slice(0, maxVisibleTiles).sort((a, b) => rank(a) - rank(b)),
    ...stable.slice(maxVisibleTiles),
  ]
}
