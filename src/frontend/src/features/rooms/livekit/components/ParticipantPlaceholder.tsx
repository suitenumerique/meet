import { Participant } from 'livekit-client'
import { styled } from '@/styled-system/jsx'
import { Avatar } from '@/components/Avatar'
import { useIsSpeaking } from '@livekit/components-react'
import { getParticipantColor } from '@/features/rooms/utils/getParticipantColor'
import { useMemo, useRef } from 'react'
import useSize from '@react-hook/size'

const StyledParticipantPlaceHolder = styled('div', {
  base: {
    width: '100%',
    height: '100%',
    backgroundColor: 'primaryDark.100',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
})

type ParticipantPlaceholderProps = {
  participant: Participant
}

export const ParticipantPlaceholder = ({
  participant,
}: ParticipantPlaceholderProps) => {
  const isSpeaking = useIsSpeaking(participant)
  const participantColor = getParticipantColor(participant)

  const placeholderEl = useRef<HTMLDivElement>(null)
  const [width, height] = useSize(placeholderEl)

  const minDimension = Math.min(width, height)
  const avatarSize = useMemo(
    () => Math.min(Math.round(minDimension * 0.9), 160),
    [minDimension]
  )

  const initialSize = useMemo(() => Math.round(avatarSize * 0.3), [avatarSize])

  return (
    <StyledParticipantPlaceHolder ref={placeholderEl}>
      <div
        style={{
          borderRadius: '50%',
          animation: isSpeaking ? 'pulse 1s infinite' : undefined,
          height: 'auto',
          aspectRatio: '1/1',
          width: '80%',
          maxWidth: `${avatarSize}px`,
          fontSize: `${initialSize}px`,
        }}
      >
        {/*fixme - participant doesn't update on ParticipantNameChanged event */}
        <Avatar
          name={participant.name}
          bgColor={participantColor}
          context="placeholder"
        />
      </div>
    </StyledParticipantPlaceHolder>
  )
}
