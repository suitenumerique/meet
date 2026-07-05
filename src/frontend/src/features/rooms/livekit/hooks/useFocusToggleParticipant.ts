import { type Participant, Track } from 'livekit-client'
import { useTogglePin } from './useMultiPin'
import Source = Track.Source

export const useFocusToggleParticipant = (participant: Participant) => {
  const trackRef = {
    participant: participant,
    publication: participant.getTrackPublication(Source.Camera),
    source: Source.Camera,
  }

  const { toggle, isPinned, canPin } = useTogglePin(trackRef)

  return {
    toggle,
    inFocus: isPinned,
    canPin,
  }
}
