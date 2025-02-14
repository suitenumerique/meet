import { useToast } from '@react-aria/toast'
import { useRef } from 'react'

import { StyledToastContainer, ToastProps } from './Toast'
import { HStack } from '@/styled-system/jsx'
import { useTranslation } from 'react-i18next'
import { Button } from '@/primitives'

export function ToastLowerHand({ state, ...props }: ToastProps) {
  const { t } = useTranslation('notifications', { keyPrefix: 'lowerHand' })
  const ref = useRef(null)
  const { toastProps, contentProps } = useToast(props, state, ref)
  const toast = props.toast

  const handleDismiss = () => {
    // Clear onClose handler to prevent lowering the hand when user dismisses
    toast.onClose = undefined
    state.close(toast.key)
  }

  return (
    <StyledToastContainer {...toastProps} ref={ref}>
      <HStack
        justify="center"
        alignItems="center"
        {...contentProps}
        padding={14}
        gap={0}
      >
        <p>{t('auto')}</p>
        <Button
          size="sm"
          variant="text"
          style={{
            color: '#60a5fa',
            marginLeft: '0.5rem',
          }}
          onPress={() => handleDismiss()}
        >
          {t('dismiss')}
        </Button>
      </HStack>
    </StyledToastContainer>
  )
}
