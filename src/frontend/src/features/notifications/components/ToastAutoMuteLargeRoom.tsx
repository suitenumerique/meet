import { useToast } from 'react-aria'
import { useRef } from 'react'

import { type ToastProps } from './Toast'
import { useTranslation } from 'react-i18next'
import { ToastCard, ToastAction } from './ToastCard'
import { useRoomContext } from '@livekit/components-react'
import { Icon } from '@/primitives/Icon'

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
    <ToastCard
      {...toastProps}
      ref={ref}
      contentProps={contentProps}
      icon={<Icon name="mic-off" />}
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
