import { useToast } from 'react-aria'
import { useMemo, useRef } from 'react'

import { type ToastProps } from './Toast'
import { useTranslation } from 'react-i18next'
import { ToastCard } from './ToastCard'
import { Icon } from '@/primitives/Icon'

export function ToastPermissionsRemoved({
  state,
  ...props
}: Readonly<ToastProps>) {
  const { t } = useTranslation('notifications', {
    keyPrefix: 'permissionsRemoved',
  })
  const ref = useRef(null)
  const { toastProps, contentProps } = useToast(props, state, ref)
  const participant = props.toast.content.participant

  const key = useMemo(() => {
    const sources = props.toast.content.removedSources

    if (!Array.isArray(sources) || sources.length === 0) {
      return undefined
    }

    if (sources.length === 1) {
      return sources[0]
    }

    if (sources.length === 2 && sources.includes('screen_share')) {
      return 'screen_share'
    }

    return undefined
  }, [props.toast.content.removedSources])

  if (!participant || !key) return null

  return (
    <ToastCard
      {...toastProps}
      ref={ref}
      contentProps={contentProps}
      variant="warning"
      icon={<Icon name="error" />}
    >
      {t(key)}
    </ToastCard>
  )
}
