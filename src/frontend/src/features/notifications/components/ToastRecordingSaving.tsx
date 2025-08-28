import { useToast } from '@react-aria/toast'
import { useMemo, useRef } from 'react'
import { Text } from '@/primitives'

import { StyledToastContainer, ToastProps } from './Toast'
import { HStack } from '@/styled-system/jsx'
import { useTranslation } from 'react-i18next'
import { useUser } from '@/features/auth'
import { css } from '@/styled-system/css'
import { RecordingMode } from '@/features/recording'

export function ToastRecordingSaving({
  state,
  ...props
}: Readonly<ToastProps>) {
  const { t } = useTranslation('notifications', { keyPrefix: 'recordingSave' })
  const ref = useRef(null)
  const { toastProps, contentProps } = useToast(props, state, ref)

  const { user } = useUser()

  const modeLabel = useMemo(() => {
    const mode = props.toast.content.mode as RecordingMode
    switch (mode) {
      case RecordingMode.Transcript:
        return 'transcript'
      case RecordingMode.ScreenRecording:
        return 'screenRecording'
    }
  }, [props.toast.content])

  return (
    <StyledToastContainer {...toastProps} ref={ref}>
      <HStack
        justify="center"
        alignItems="center"
        {...contentProps}
        padding={14}
        gap={1}
      >
        <Text
          margin={false}
          className={css({
            maxWidth: '22rem',
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
            whiteSpace: 'normal',
          })}
        >
          {user?.email ? (
            <span
              dangerouslySetInnerHTML={{
                __html: t(`${modeLabel}.message`, {
                  email: user.email,
                }),
              }}
            />
          ) : (
            t(`${modeLabel}.default`)
          )}
        </Text>
      </HStack>
    </StyledToastContainer>
  )
}
