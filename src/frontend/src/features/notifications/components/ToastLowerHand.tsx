import { useToast } from 'react-aria'
import { useRef } from 'react'

import { type ToastProps } from './Toast'
import { useTranslation } from 'react-i18next'
import { RiHand } from '@remixicon/react'
import { ToastCard, ToastAction } from './ToastCard'

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
      icon={<RiHand />}
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
