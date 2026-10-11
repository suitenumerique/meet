import type { TrackReferenceOrPlaceholder } from '@livekit/components-core'
import { Track } from 'livekit-client'

/**
 * Splits carousel tiles into a fixed head and a rest that is free to reorder.
 *
 * Head: the local camera, then the top speaker's camera. When only one tile
 * fits, the speaker goes first so they are the one on screen. The rest goes
 * through `useVisualStableUpdate`.
 *
 * `restSlots` is how many on-screen slots are left for the rest. It is 0 or
 * negative when the head fills the carousel.
 *
 * The speaker slot is reserved even while it is empty: `useVisualStableUpdate`
 * treats any change of page size as a relayout and re-sorts everything, so it
 * must not move when the first speaker gets promoted.
 */
export function splitCarouselTiles(
  tracks: TrackReferenceOrPlaceholder[],
  topSpeakerId: string | undefined,
  maxVisibleTiles: number
) {
  const cameraOf = (match: (t: TrackReferenceOrPlaceholder) => boolean) =>
    tracks.find((t) => t.source === Track.Source.Camera && match(t))

  const local = cameraOf((t) => t.participant.isLocal)
  const speaker = topSpeakerId
    ? cameraOf((t) => t.participant.identity === topSpeakerId)
    : undefined

  const order = maxVisibleTiles < 2 ? [speaker, local] : [local, speaker]
  const head = order.filter((t) => t !== undefined)
  const rest = tracks.filter((t) => !head.includes(t))

  const reservedSlots = (local ? 1 : 0) + 1
  const restSlots = maxVisibleTiles - reservedSlots

  return { head, rest, restSlots }
}
