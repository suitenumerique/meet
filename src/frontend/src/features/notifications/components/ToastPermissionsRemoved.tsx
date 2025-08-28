import { useToast } from '@react-aria/toast'
import { useMemo, useRef } from 'react'

import { StyledToastContainer, ToastProps } from './Toast'
import { HStack } from '@/styled-system/jsx'
import { useTranslation } from 'react-i18next'

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
    <StyledToastContainer {...toastProps} ref={ref}>
      <HStack
        justify="center"
        alignItems="center"
        {...contentProps}
        padding={14}
        gap={0}
      >
        {t(key)}
      </HStack>
    </StyledToastContainer>
  )
}
