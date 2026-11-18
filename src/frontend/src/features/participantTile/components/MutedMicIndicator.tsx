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
        width: 'var(--metadata-item-size)',
        height: 'var(--metadata-item-size)',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      <RiMicOffFill size={16} color="white" />
    </div>
  )
}
