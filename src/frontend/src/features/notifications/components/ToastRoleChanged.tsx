import { useToast } from 'react-aria'
import { useRef } from 'react'

import { type ToastProps } from './Toast'
import { useTranslation } from 'react-i18next'
import { ToastCard } from './ToastCard'

export function ToastRoleChanged({ state, ...props }: Readonly<ToastProps>) {
  const { t } = useTranslation('notifications', { keyPrefix: 'roleChanged' })
  const ref = useRef(null)
  const { toastProps, contentProps } = useToast(props, state, ref)
  const newRole = t(`roles.${props.toast.content.newRole}`)

  return (
    <ToastCard
      {...toastProps}
      ref={ref}
      contentProps={contentProps}
    >
      {t('body', { role: newRole })}
    </ToastCard>
  )
}
