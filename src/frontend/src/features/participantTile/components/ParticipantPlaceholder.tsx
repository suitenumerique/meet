import type { Participant } from 'livekit-client'
import { styled } from '@/styled-system/jsx'
import { Avatar } from '@/components/Avatar'
import { useIsSpeaking } from '@livekit/components-react'
import { getParticipantBackgroundGradient } from '@/features/rooms/utils/getParticipantBackgroundGradient'
import { getParticipantColor } from '@/features/rooms/utils/getParticipantColor'
import { useMemo } from 'react'

const StyledParticipantPlaceHolder = styled('div', {
  base: {
    width: '100%',
    height: '100%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    containerType: 'size',
  },
})

const StyledAvatarWrapper = styled('div', {
  base: {
    borderRadius: '50%',
    aspectRatio: '1 / 1',
    width: 'min(90cqmin, 160px)',
    fontSize: 'min(27cqmin, 48px)',
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
  const backgroundGradient = useMemo(
    () => getParticipantBackgroundGradient(participantColor),
    [participantColor]
  )

  return (
    <StyledParticipantPlaceHolder
      style={{
        backgroundColor: participantColor,
        backgroundImage: backgroundGradient,
      }}
    >
      <StyledAvatarWrapper
        style={{ animation: isSpeaking ? 'pulse 1s infinite' : undefined }}
      >
        <Avatar
          name={participant.name}
          bgColor={participantColor}
          context="placeholder"
        />
      </StyledAvatarWrapper>
    </StyledParticipantPlaceHolder>
  )
}
