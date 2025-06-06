import { styled } from '@/styled-system/jsx'

const StyledContainer = styled('div', {
  base: {
    width: '24px',
    height: '24px',
    boxSizing: 'border-box',
    backgroundColor: 'primary',
    borderRadius: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2px',
  },
  variants: {
    pushToTalk: {
      true: {
        height: '46px',
        width: '58px',
        borderLeftRadius: 8,
        borderRightRadius: 0,
        backgroundColor: 'primary.200',
        border: '1px solid primary.500',
        gap: '3px',
      },
    },
  },
})

const StyledChild = styled('div', {
  base: {
    backgroundColor: 'white',
    width: '4px',
    height: '4px',
    borderRadius: '4px',
    animationDuration: '400ms',
    animationName: 'active_speaker',
    animationIterationCount: 'infinite',
    animationDirection: 'alternate',
  },
  variants: {
    active: {
      true: {
        animationIterationCount: 'infinite',
      },
      false: {
        animationIterationCount: 0,
      },
    },
    size: {
      small: {
        animationName: 'active_speaker_small',
      },
    },
    pushToTalk: {
      true: {
        backgroundColor: 'primary',
        width: '6px',
        height: '6px',
      },
    },
  },
})

export type ActiveSpeakerProps = {
  isSpeaking: boolean
  pushToTalk?: boolean
}

export const ActiveSpeaker = ({
  isSpeaking,
  pushToTalk,
}: ActiveSpeakerProps) => {
  return (
    <StyledContainer pushToTalk={pushToTalk}>
      <StyledChild
        pushToTalk={pushToTalk}
        active={isSpeaking}
        size="small"
        style={{
          animationDelay: '300ms',
        }}
      />
      <StyledChild
        pushToTalk={pushToTalk}
        active={isSpeaking}
        style={{
          animationDelay: '100ms',
        }}
      />
      <StyledChild
        pushToTalk={pushToTalk}
        active={isSpeaking}
        size="small"
        style={{
          animationDelay: '500ms',
        }}
      />
    </StyledContainer>
  )
}
