import { useTrackMutedIndicator } from '@livekit/components-react'
import { Participant, Track } from 'livekit-client'
import Source = Track.Source
import { Div } from '@/primitives'
import { RiMicOffFill } from '@remixicon/react'

export const MutedMicIndicator = ({
  participant,
}: {
  participant: Participant
}) => {
  const { isMuted } = useTrackMutedIndicator({
    participant: participant,
    source: Source.Microphone,
  })

  if (!isMuted) {
    return null
  }

  return (
    <Div padding={0.25} backgroundColor="#E1000F" borderRadius="4px">
      <RiMicOffFill size={16} color="white" />
    </Div>
  )
}
