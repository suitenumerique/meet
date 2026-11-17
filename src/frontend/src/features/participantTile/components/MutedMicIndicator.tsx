import { useTrackMutedIndicator } from '@livekit/components-react'
import { type Participant, Track } from 'livekit-client'
import Source = Track.Source
import { RiMicOffFill } from '@remixicon/react'
import { css } from '@/styled-system/css'

export const MutedMicIndicator = ({
  participant,
}: {
  participant: Participant
}) => {
  const { isMuted } = useTrackMutedIndicator({
    participant: participant,
    source: Source.Microphone,
  })

  if (!isMuted && participant.isMicrophoneEnabled) {
    return null
  }

  return (
    <div
      className={css({
        backgroundColor: 'error.550',
        borderRadius: '4px',
        padding: '3xs',
      })}
    >
      <RiMicOffFill size={16} color="white" />
    </div>
  )
}
