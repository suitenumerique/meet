import { useFocusToggle } from '@livekit/components-react'
import { Participant, Track } from 'livekit-client'
import { useCallback } from 'react'
import type { MouseEvent } from 'react'
import Source = Track.Source

export const useFocusToggleParticipant = (participant: Participant) => {
  const trackRef = {
    participant: participant,
    publication: participant.getTrackPublication(Source.Camera),
    source: Source.Camera,
  }

  const { mergedProps, inFocus } = useFocusToggle({
    trackRef,
    props: {},
  })

  const toggle = useCallback(() => {
    const syntheticEvent = {
      preventDefault: () => {},
      stopPropagation: () => {},
    } as MouseEvent<HTMLButtonElement>

    mergedProps?.onClick?.(syntheticEvent)
  }, [mergedProps])

  return {
    toggle,
    inFocus,
  }
}
