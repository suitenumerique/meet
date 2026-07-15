import type { Participant } from 'livekit-client'
import { styled } from '@/styled-system/jsx'
import { Avatar } from '@/components/Avatar'
import { useIsSpeaking } from '@livekit/components-react'
import { getParticipantBackgroundGradient } from '@/features/rooms/utils/getParticipantBackgroundGradient'
import { getParticipantColor } from '@/features/rooms/utils/getParticipantColor'
import { useSize } from '@/features/rooms/livekit/hooks/useResizeObserver'
import { useMemo, useRef } from 'react'

const StyledParticipantPlaceHolder = styled('div', {
  base: {
    width: '100%',
    height: '100%',
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
  const backgroundGradient = useMemo(
    () => getParticipantBackgroundGradient(participantColor),
    [participantColor]
  )

  const placeholderEl = useRef<HTMLDivElement>(null)
  const { width, height } = useSize(placeholderEl)

  const minDimension = Math.min(width, height)
  const avatarSize = useMemo(
    () => Math.min(Math.round(minDimension * 0.9), 160),
    [minDimension]
  )

  const initialSize = useMemo(() => Math.round(avatarSize * 0.3), [avatarSize])

  return (
    <StyledParticipantPlaceHolder
      ref={placeholderEl}
      style={{
        backgroundColor: participantColor,
        backgroundImage: backgroundGradient,
      }}
    >
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
