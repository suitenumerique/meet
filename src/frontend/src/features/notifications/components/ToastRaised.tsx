import { useToast } from '@react-aria/toast'
import { useRef } from 'react'

import { StyledToastContainer, ToastProps } from './Toast'
import { HStack } from '@/styled-system/jsx'
import { Button, Div } from '@/primitives'
import { useTranslation } from 'react-i18next'
import { RiCloseLine, RiHand } from '@remixicon/react'
import { useSidePanel } from '@/features/rooms/livekit/hooks/useSidePanel'
import { css } from '@/styled-system/css'

export function ToastRaised({ state, ...props }: Readonly<ToastProps>) {
  const { t } = useTranslation('notifications')
  const ref = useRef(null)
  const { toastProps, contentProps, titleProps, closeButtonProps } = useToast(
    props,
    state,
    ref
  )
  const participant = props.toast.content.participant
  const { isParticipantsOpen, toggleParticipants } = useSidePanel()

  if (!participant) return

  return (
    <StyledToastContainer {...toastProps} ref={ref}>
      <HStack
        justify="center"
        alignItems="center"
        {...contentProps}
        padding={14}
        gap={0}
      >
        <RiHand
          color="white"
          style={{
            marginRight: '1rem',
            animationDuration: '300ms',
            animationName: 'wave_hand',
            animationIterationCount: '2',
          }}
        />
        <Div {...titleProps} marginRight={0.5}>
          {t('raised.description', {
            name: participant.name || t('defaultName'),
          })}
        </Div>
        {!isParticipantsOpen && (
          <Button
            size="sm"
            variant="text"
            className={css({
              color: 'primary.300',
            })}
            onPress={(e) => {
              toggleParticipants()
              closeButtonProps.onPress?.(e)
            }}
          >
            {t('raised.cta')}
          </Button>
        )}
        <Button square size="sm" invisible {...closeButtonProps}>
          <RiCloseLine size={18} color="white" />
        </Button>
      </HStack>
    </StyledToastContainer>
  )
}
