import { useToast } from 'react-aria'
import { useRef } from 'react'

import { type ToastProps } from './Toast'
import { HStack } from '@/styled-system/jsx'
import { useTranslation } from 'react-i18next'
import { StyledToastContainer } from './StyledToastContainer'

// The rooms closing, or the microphone turned off by a change of room: what
// the banner naming the room does not say.
export function ToastBreakoutRoomChanged({
  state,
  ...props
}: Readonly<ToastProps>) {
  const { t } = useTranslation('notifications', { keyPrefix: 'breakout' })
  const ref = useRef(null)
  const { toastProps, contentProps } = useToast(props, state, ref)
  const closed: boolean = !!props.toast.content.closed
  const muted: boolean = !!props.toast.content.muted

  return (
    <StyledToastContainer {...toastProps} ref={ref}>
      <HStack
        justify="center"
        alignItems="center"
        {...contentProps}
        padding={14}
        gap={0}
        flexDirection="column"
      >
        {closed && <span>{t('closed')}</span>}
        {muted && <span>{t('muted')}</span>}
      </HStack>
    </StyledToastContainer>
  )
}
