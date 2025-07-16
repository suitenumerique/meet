import { useToast } from '@react-aria/toast'
import { useRef } from 'react'
import { Button as RACButton } from 'react-aria-components'
import { Track } from 'livekit-client'
import Source = Track.Source

import { useMaybeLayoutContext } from '@livekit/components-react'
import { ParticipantTile } from '@/features/rooms/livekit/components/ParticipantTile'
import { StyledToastContainer, ToastProps } from './Toast'
import { HStack, styled } from '@/styled-system/jsx'
import { Div } from '@/primitives'
import { useTranslation } from 'react-i18next'

const ClickableToast = styled(RACButton, {
  base: {
    cursor: 'pointer',
    display: 'flex',
    borderRadius: 'inherit',
  },
})

export function ToastJoined({ state, ...props }: ToastProps) {
  const { t } = useTranslation('notifications')
  const ref = useRef(null)
  const { toastProps, contentProps, titleProps, closeButtonProps } = useToast(
    props,
    state,
    ref
  )
  const layoutContext = useMaybeLayoutContext()
  const participant = props.toast.content.participant

  if (!participant) return

  const trackReference = {
    participant,
    publication: participant.getTrackPublication(Source.Camera),
    source: Source.Camera,
  }
  const pinParticipant = () => {
    layoutContext?.pin.dispatch?.({
      msg: 'set_pin',
      trackReference,
    })
  }
  return (
    <StyledToastContainer {...toastProps} ref={ref}>
      <ClickableToast
        ref={ref}
        onPress={(e) => {
          pinParticipant()
          closeButtonProps.onPress?.(e)
        }}
      >
        <HStack justify="center" alignItems="center" {...contentProps}>
          <Div display="flex" overflow="hidden" width="128" height="72">
            <ParticipantTile
              trackRef={trackReference}
              disableSpeakingIndicator={true}
              disableMetadata={true}
              style={{
                borderRadius: '7px 0 0 7px',
                width: '100%',
              }}
            />
          </Div>
          <Div padding={20} {...titleProps}>
            {t('joined.description', {
              name: participant.name || t('defaultName'),
            })}
          </Div>
        </HStack>
      </ClickableToast>
    </StyledToastContainer>
  )
}
