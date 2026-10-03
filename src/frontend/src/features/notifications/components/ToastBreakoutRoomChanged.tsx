import { useToast } from 'react-aria'
import { useRef } from 'react'

import { type ToastProps } from './Toast'
import { HStack } from '@/styled-system/jsx'
import { useTranslation } from 'react-i18next'
import { StyledToastContainer } from './StyledToastContainer'

// The room this browser just moved to, or no room when the rooms closed.
export function ToastBreakoutRoomChanged({
  state,
  ...props
}: Readonly<ToastProps>) {
  const { t } = useTranslation('notifications', { keyPrefix: 'breakout' })
  const ref = useRef(null)
  const { toastProps, contentProps } = useToast(props, state, ref)
  const room: string | null = props.toast.content.room

  return (
    <StyledToastContainer {...toastProps} ref={ref}>
      <HStack
        justify="center"
        alignItems="center"
        {...contentProps}
        padding={14}
        gap={0}
      >
        {room ? t('moved', { room }) : t('closed')}
      </HStack>
    </StyledToastContainer>
  )
}
