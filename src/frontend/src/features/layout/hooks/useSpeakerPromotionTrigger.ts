import { RoomEvent } from 'livekit-client'
import type { Participant } from 'livekit-client'
import type { TrackReferenceOrPlaceholder } from '@livekit/components-core'
import { useRoomContext } from '@livekit/components-react'
import { useEffect, useReducer, useRef } from 'react'

/**
 * Tripwire for speaker promotion.
 *
 * Listens to `RoomEvent.ActiveSpeakersChanged` imperatively and forces ONE
 * re-render of the host when a speaker has a tile in `allTiles` but none in
 * `visibleTiles`. That render re-runs `useVisualStableUpdate`, which reads
 * live `participant.isSpeaking` state and performs the actual swap.
 *
 * Speakers already visible cost nothing, nor do speakers the layout doesn't
 * show at all (e.g. the pinned participant, rendered by the focus view).
 *
 * Requires the parent to NOT re-render on speaker events itself, i.e.
 * `useTracks(..., { updateOnlyOn: [] })` upstream.
 */
export function useSpeakerPromotionTrigger(
  /** Tiles inside the span the layout guarantees to speakers. */
  visibleTiles: TrackReferenceOrPlaceholder[],
  /** Every tile the layout shows, visible or not. */
  allTiles: TrackReferenceOrPlaceholder[]
) {
  const room = useRoomContext()
  const [, forceRender] = useReducer((n: number) => n + 1, 0)

  // Read by the listener at event time, so it never re-subscribes.
  const tilesRef = useRef({ visibleTiles, allTiles })
  tilesRef.current = { visibleTiles, allTiles }

  useEffect(() => {
    const onActiveSpeakersChanged = (speakers: Participant[]) => {
      const { visibleTiles, allTiles } = tilesRef.current
      const visible = new Set(visibleTiles.map((t) => t.participant.identity))
      const shown = new Set(allTiles.map((t) => t.participant.identity))
      const hidden = speakers.some(
        (speaker) =>
          shown.has(speaker.identity) && !visible.has(speaker.identity)
      )
      if (hidden) {
        forceRender()
      }
    }
    room.on(RoomEvent.ActiveSpeakersChanged, onActiveSpeakersChanged)
    return () => {
      room.off(RoomEvent.ActiveSpeakersChanged, onActiveSpeakersChanged)
    }
  }, [room])
}
