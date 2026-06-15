import { useToast } from '@react-aria/toast'
import { useRef } from 'react'

import { type ToastProps } from './Toast'
import { VStack } from '@/styled-system/jsx'
import { useTranslation } from 'react-i18next'
import { Button } from '@/primitives'
import { css } from '@/styled-system/css'
import { StyledToastContainer } from './StyledToastContainer'
import { useRoomContext } from '@livekit/components-react'

export function ToastAutoMuteLargeRoom({
  state,
  ...props
}: Readonly<ToastProps>) {
  const room = useRoomContext()
  const { t } = useTranslation('notifications', {
    keyPrefix: 'autoMuteLargeRoom',
  })
  const ref = useRef(null)
  const { toastProps, contentProps } = useToast(props, state, ref)
  const toast = props.toast

  const handleDismiss = async () => {
    room.localParticipant
      .setMicrophoneEnabled(true)
      .finally(() => state.close(toast.key))
  }

  return (
    <StyledToastContainer {...toastProps} ref={ref}>
      <VStack
        justify="start"
        alignItems="self-start"
        {...contentProps}
        maxWidth="370px"
        gap="0.75rem"
        padding={14}
      >
        <p>{t('auto')}</p>
        <Button
          size="sm"
          variant="text"
          className={css({
            color: 'primary.300',
          })}
          onPress={() => handleDismiss()}
        >
          {t('dismiss')}
        </Button>
      </VStack>
    </StyledToastContainer>
  )
}
