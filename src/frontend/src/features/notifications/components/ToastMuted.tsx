import { useToast } from 'react-aria'
import { useRef } from 'react'

import { type ToastProps } from './Toast'
import { useTranslation } from 'react-i18next'
import { ToastCard } from './ToastCard'
import { Icon } from '@/primitives/Icon'

export function ToastMuted({ state, ...props }: Readonly<ToastProps>) {
  const { t } = useTranslation('notifications')
  const ref = useRef(null)
  const { toastProps, contentProps } = useToast(props, state, ref)
  const participant = props.toast.content.participant

  if (!participant) return

  return (
    <ToastCard
      {...toastProps}
      ref={ref}
      contentProps={contentProps}
      icon={<Icon name="mic-off" />}
    >
      {t('muted', { name: participant.name })}
    </ToastCard>
  )
}
