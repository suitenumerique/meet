import { useToast } from 'react-aria'
import { useRef } from 'react'

import { type ToastProps } from './Toast'
import { HStack } from '@/styled-system/jsx'
import { useTranslation } from 'react-i18next'
import { StyledToastContainer } from './StyledToastContainer'

export function ToastSpeakerChanged({ state, ...props }: Readonly<ToastProps>) {
  const { t } = useTranslation('notifications', { keyPrefix: 'speakerChanged' })
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
        {t(props.toast.content.isSpeaker ? 'granted' : 'removed')}
      </HStack>
    </StyledToastContainer>
  )
}
