import { toastQueue } from './components/ToastProvider'
import { NotificationType } from './NotificationType'
import { NotificationDuration } from './NotificationDuration'
import { Participant } from 'livekit-client'
import { NotificationPayload } from './NotificationPayload'

export const showLowerHandToast = (
  participant: Participant,
  onClose: () => void
) => {
  toastQueue.add(
    {
      participant,
      type: NotificationType.LowerHand,
    },
    {
      timeout: NotificationDuration.LOWER_HAND,
      onClose,
    }
  )
}

export const closeLowerHandToasts = () => {
  toastQueue.visibleToasts.forEach((toast) => {
    if (toast.content.type === NotificationType.LowerHand) {
      toastQueue.close(toast.key)
    }
  })
}

export const decodeNotificationDataReceived = (
  payload: Uint8Array
): NotificationPayload => {
  const decoder = new TextDecoder()
  return JSON.parse(decoder.decode(payload))
}
