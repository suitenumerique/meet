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
 * `visibleTiles`. That render re-runs the host's tile ordering, which reads
 * live `participant.isSpeaking` state and performs the actual swap.
 *
 * Speakers already visible cost nothing, nor do speakers the layout doesn't
 * show at all (e.g. the pinned participant, rendered by the focus view).
 *
 * With `raisedHands`, it also trips when a hand goes up or down while a
 * raised hand is hidden: the hand that just went up, or the next one waiting
 * for the slot of a hand that went down. Only for hosts whose ordering
 * promotes raised hands; others would render for nothing.
 *
 * Requires the parent to NOT re-render on these events itself, i.e.
 * `useTracks(..., { updateOnlyOn: [] })` upstream.
 */
export function useSpeakerPromotionTrigger(
  /** Tiles inside the span the layout guarantees to speakers. */
  visibleTiles: TrackReferenceOrPlaceholder[],
  /** Every tile the layout shows, visible or not. */
  allTiles: TrackReferenceOrPlaceholder[],
  { raisedHands = false }: { raisedHands?: boolean } = {}
) {
  const room = useRoomContext()
  const [, forceRender] = useReducer((n: number) => n + 1, 0)

  // Read by the listeners at event time, so they never re-subscribe.
  const tilesRef = useRef({ visibleTiles, allTiles })
  tilesRef.current = { visibleTiles, allTiles }

  useEffect(() => {
    const renderIfHidden = (participants: Participant[]) => {
      const { visibleTiles, allTiles } = tilesRef.current
      const visible = new Set(visibleTiles.map((t) => t.participant.identity))
      const shown = new Set(allTiles.map((t) => t.participant.identity))
      const hidden = participants.some(
        ({ identity }) => shown.has(identity) && !visible.has(identity)
      )
      if (hidden) {
        forceRender()
      }
    }

    const onAttributesChanged = (changed: Record<string, string>) => {
      if ('handRaisedAt' in changed) {
        renderIfHidden(
          tilesRef.current.allTiles
            .map((t) => t.participant)
            .filter((p) => !!p.attributes.handRaisedAt)
        )
      }
    }

    room.on(RoomEvent.ActiveSpeakersChanged, renderIfHidden)
    if (raisedHands) {
      room.on(RoomEvent.ParticipantAttributesChanged, onAttributesChanged)
    }
    return () => {
      room.off(RoomEvent.ActiveSpeakersChanged, renderIfHidden)
      room.off(RoomEvent.ParticipantAttributesChanged, onAttributesChanged)
    }
  }, [room, raisedHands])
}
