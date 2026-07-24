import { RoomEvent } from 'livekit-client'
import type { Participant } from 'livekit-client'
import type { TrackReferenceOrPlaceholder } from '@livekit/components-core'
import { useRoomContext } from '@livekit/components-react'
import * as React from 'react'

/**
 * Tripwire for speaker promotion.
 *
 * Listens to `RoomEvent.ActiveSpeakersChanged` imperatively and forces ONE
 * re-render of the host component only when an active speaker has none of
 * their tiles are within the visible span (`maxVisibleTiles`). That render
 * re-runs `useVisualStableUpdate`, which reads live `participant.isSpeaking`
 * state and performs the actual swap.
 *
 * Speakers already visible are ignored. Everything else costs zero React work.
 *
 * Requires the parent to NOT re-render on speaker events itself, i.e.
 * `useTracks(..., { updateOnlyOn: [] })` upstream.
 */
export function useSpeakerPromotionTrigger(
  sortedTiles: TrackReferenceOrPlaceholder[],
  maxVisibleTiles: number
) {
  console.count('useSpeakerPromotionTrigger')
  const room = useRoomContext()
  const [, forceRender] = React.useReducer((n: number) => n + 1, 0)

  // Refs so the listener reads current values without re-subscribing
  // and without itself being a render dependency.
  const tilesRef = React.useRef(sortedTiles)
  tilesRef.current = sortedTiles
  const maxRef = React.useRef(maxVisibleTiles)
  maxRef.current = maxVisibleTiles

  React.useEffect(() => {
    const onActiveSpeakersChanged = (speakers: Participant[]) => {
      const tiles = tilesRef.current
      const hiddenSpeakerExists = speakers.some(
        (speaker) =>
          !tiles.some((t) => t.participant.identity === speaker.identity)
      )
      if (hiddenSpeakerExists) {
        forceRender()
      }
    }
    room.on(RoomEvent.ActiveSpeakersChanged, onActiveSpeakersChanged)
    return () => {
      room.off(RoomEvent.ActiveSpeakersChanged, onActiveSpeakersChanged)
    }
  }, [room])
}
