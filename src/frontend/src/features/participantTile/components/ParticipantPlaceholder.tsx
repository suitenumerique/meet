import { styled } from '@/styled-system/jsx'
import { Avatar } from '@/components/Avatar'
import { getParticipantBackgroundGradient } from '@/features/rooms/utils/getParticipantBackgroundGradient'
import React, { useMemo } from 'react'

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
    '[data-lk-speaking="true"] &': {
      animation: 'pulse 1s infinite',
    },
  },
})

type ParticipantPlaceholderProps = {
  color: string
  displayedNamed: string
}

export const ParticipantPlaceholder = React.memo(
  ({ color, displayedNamed }: ParticipantPlaceholderProps) => {
    const backgroundGradient = useMemo(
      () => getParticipantBackgroundGradient(color),
      [color]
    )
    return (
      <StyledParticipantPlaceHolder
        style={{
          backgroundColor: color,
          backgroundImage: backgroundGradient,
        }}
      >
        <StyledAvatarWrapper>
          <Avatar name={displayedNamed} bgColor={color} context="placeholder" />
        </StyledAvatarWrapper>
      </StyledParticipantPlaceHolder>
    )
  }
)

ParticipantPlaceholder.displayName = 'ParticipantPlaceholder'
