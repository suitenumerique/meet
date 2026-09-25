import { useToast } from 'react-aria'
import { useMemo, useRef } from 'react'
import { Button as RACButton } from 'react-aria-components'
import { Track } from 'livekit-client'
import Source = Track.Source

import { ParticipantTile } from '@/features/participantTile/components/ParticipantTile.tsx'
import { type ToastProps } from './Toast'
import { HStack, styled } from '@/styled-system/jsx'
import { Div } from '@/primitives'
import { useTranslation } from 'react-i18next'
import { StyledToastContainer } from './StyledToastContainer'
import { setPinnedTrack } from '@/stores/layout'
import { useParticipantTracks } from '@livekit/components-react'

const ClickableToast = styled(RACButton, {
  base: {
    cursor: 'pointer',
    display: 'flex',
    borderRadius: 'inherit',
  },
})

export function ToastJoined({ state, ...props }: Readonly<ToastProps>) {
  const { t } = useTranslation('notifications')
  const ref = useRef(null)
  const { toastProps, contentProps, titleProps, closeButtonProps } = useToast(
    props,
    state,
    ref
  )
  const participant = props.toast.content.participant

  const [cameraTrack] = useParticipantTracks(
    [Source.Camera],
    participant?.identity
  )

  const trackReference = useMemo(
    () => cameraTrack ?? { participant, source: Source.Camera },
    [cameraTrack, participant]
  )

  if (!participant) return

  return (
    <StyledToastContainer {...toastProps} ref={ref}>
      <ClickableToast
        ref={ref}
        onPress={(e) => {
          setPinnedTrack(trackReference)
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
