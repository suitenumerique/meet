import { useToast } from 'react-aria'
import { useRef } from 'react'

import { type ToastProps } from './Toast'
import { HStack } from '@/styled-system/jsx'
import { useTranslation } from 'react-i18next'
import { StyledToastContainer } from './StyledToastContainer'

export function ToastRoleChanged({ state, ...props }: Readonly<ToastProps>) {
  const { t } = useTranslation('notifications', { keyPrefix: 'roleChanged' })
  const ref = useRef(null)
  const { toastProps, contentProps } = useToast(props, state, ref)
  const newRole = t(`roles.${props.toast.content.newRole}`)

  return (
    <StyledToastContainer {...toastProps} ref={ref}>
      <HStack
        justify="center"
        alignItems="center"
        {...contentProps}
        padding={14}
        gap={0}
      >
        {t('body', { role: newRole })}
      </HStack>
    </StyledToastContainer>
  )
}
