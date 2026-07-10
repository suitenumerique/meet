import {
  isTrackReferencePinned,
} from '@livekit/components-core'
import { useFocusToggle, useMaybeLayoutContext } from '@livekit/components-react'
import { type Participant, Track } from 'livekit-client'
import { useCallback } from 'react'
import type { MouseEvent } from 'react'
import Source = Track.Source

const getParticipantPinTrackRef = (participant: Participant) => {
  const screenSharePublication = participant.getTrackPublication(
    Source.ScreenShare
  )
  const source =
    participant.isScreenShareEnabled && screenSharePublication
      ? Source.ScreenShare
      : Source.Camera

  return {
    participant,
    publication: participant.getTrackPublication(source),
    source,
  }
}

export const useFocusToggleParticipant = (participant: Participant) => {
  const layoutContext = useMaybeLayoutContext()
  const trackRef = getParticipantPinTrackRef(participant)

  const { mergedProps, inFocus: isFocusedTrack } = useFocusToggle({
    trackRef,
    props: {},
  })

  const inFocus =
    isFocusedTrack ||
    (!!layoutContext?.pin.state &&
      [Source.Camera, Source.ScreenShare].some((source) => {
        const ref = {
          participant,
          publication: participant.getTrackPublication(source),
          source,
        }
        return (
          !!ref.publication &&
          isTrackReferencePinned(ref, layoutContext.pin.state)
        )
      }))

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
