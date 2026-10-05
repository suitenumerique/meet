import { useToast } from 'react-aria'
import { useRef } from 'react'

import { type ToastProps } from './Toast'
import { HStack } from '@/styled-system/jsx'
import { useTranslation } from 'react-i18next'
import { StyledToastContainer } from './StyledToastContainer'
import { useConfig } from '@/api/useConfig'

export function ToastRoomFull({ state, ...props }: Readonly<ToastProps>) {
  const { t } = useTranslation('notifications')
  const { data } = useConfig()
  const ref = useRef(null)
  const { toastProps, contentProps } = useToast(props, state, ref)

  return (
    <StyledToastContainer {...toastProps} ref={ref}>
      <HStack
        justify="center"
        alignItems="center"
        {...contentProps}
        padding={14}
        gap={0}
      >
        {t('roomFull', { count: data?.room_max_participants ?? 0 })}
      </HStack>
    </StyledToastContainer>
  )
}
