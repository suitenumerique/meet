import type { TrackReferenceOrPlaceholder } from '@livekit/components-core'
import { useRoomContext } from '@livekit/components-react'
import { Track } from 'livekit-client'
import { useEffect, useRef, useState } from 'react'
import { watchTopSpeaker } from '../utils/watchTopSpeaker'

/**
 * Identity of the participant who should hold the top speaker slot, among
 * those with a camera tile in `tracks`: the slot only shows cameras, so a
 * participant whose camera is pinned away can't hold it through their screen
 * share. See `watchTopSpeaker` for the rules.
 *
 * Re-renders the host only when the holder changes. Expects
 * `useTracks(..., { updateOnlyOn: [] })` upstream.
 */
export function useTopSpeaker(tracks: TrackReferenceOrPlaceholder[]) {
  const room = useRoomContext()
  const [topSpeakerId, setTopSpeakerId] = useState<string>()

  // Read by the listener at event time; subscribing once keeps the hold
  // state alive across renders.
  const tracksRef = useRef(tracks)
  tracksRef.current = tracks

  useEffect(
    () =>
      watchTopSpeaker(room, {
        isEligible: (identity) =>
          tracksRef.current.some(
            (t) =>
              t.participant.identity === identity &&
              t.source === Track.Source.Camera
          ),
        onChange: setTopSpeakerId,
      }),
    [room]
  )

  return topSpeakerId
}
