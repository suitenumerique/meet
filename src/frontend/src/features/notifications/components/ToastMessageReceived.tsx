import { useToast } from '@react-aria/toast'
import { useEffect, useRef } from 'react'

import { StyledToastContainer, ToastProps } from './Toast'
import { Text } from '@/primitives'
import { RiMessage2Line } from '@remixicon/react'
import { useSidePanel } from '@/features/rooms/livekit/hooks/useSidePanel'
import { Button as RACButton } from 'react-aria-components'
import { css } from '@/styled-system/css'
import { useTranslation } from 'react-i18next'

export function ToastMessageReceived({ state, ...props }: ToastProps) {
  const { t } = useTranslation('notifications')
  const ref = useRef(null)
  const { toastProps } = useToast(props, state, ref)

  const toast = props.toast

  const participant = toast.content.participant
  const message = toast.content.message

  const { isChatOpen, toggleChat } = useSidePanel()

  useEffect(() => {
    if (isChatOpen) {
      state.close(toast.key)
    }
  }, [isChatOpen, toast, state])

  if (isChatOpen || !participant) return null

  return (
    <StyledToastContainer {...toastProps} ref={ref}>
      <RACButton onPress={() => toggleChat()} aria-label={t('openChat')}>
        <div
          className={css({
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'start',
            padding: '14px',
            gap: '0.75rem',
            textAlign: 'start',
            width: '250px',
            md: {
              width: '350px',
            },
          })}
        >
          <div
            className={css({
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'start',
              gap: '0.5rem',
            })}
          >
            <RiMessage2Line
              size={20}
              className={css({
                color: 'primary.300',
                marginTop: '3px',
              })}
              aria-hidden="true"
            />
            <span>{participant.name}</span>
          </div>
          <Text margin={false} centered={false} wrap={'pretty'} fullWidth>
            {message}
          </Text>
        </div>
      </RACButton>
    </StyledToastContainer>
  )
}
