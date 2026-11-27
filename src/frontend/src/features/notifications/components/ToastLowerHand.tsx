import { useToast } from 'react-aria'
import { useRef } from 'react'

import { type ToastProps } from './Toast'
import { useTranslation } from 'react-i18next'
import { ToastCard, ToastAction } from './ToastCard'
import { Icon } from '@/primitives/Icon'

export function ToastLowerHand({ state, ...props }: Readonly<ToastProps>) {
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
    <ToastCard
      {...toastProps}
      ref={ref}
      contentProps={contentProps}
      icon={<Icon name="hand" />}
      actions={
        <ToastAction onPress={() => handleDismiss()}>
          {t('dismiss')}
        </ToastAction>
      }
    >
      {t('auto')}
    </ToastCard>
  )
}
