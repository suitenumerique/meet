import { toastQueue } from './components/ToastProvider'
import { NotificationType } from './NotificationType'
import { NotificationDuration } from './NotificationDuration'
import { Participant } from 'livekit-client'
import { NotificationPayload } from './NotificationPayload'
import { RecordingMode } from '@/features/recording'

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
): NotificationPayload | undefined => {
  if (!payload || !(payload instanceof Uint8Array)) {
    throw new Error('Invalid payload: expected Uint8Array')
  }
  try {
    const decoder = new TextDecoder()
    const jsonString = decoder.decode(payload)
    if (!jsonString || typeof jsonString !== 'string') {
      throw new Error('Invalid decoded content')
    }
    // Parse with additional validation if needed
    const parsed = JSON.parse(jsonString)
    return parsed as NotificationPayload
  } catch (error) {
    // Handle errors appropriately for your application
    console.error('Failed to decode notification payload:', error)
    return
  }
}

export const notifyRecordingSaveInProgress = (
  mode: RecordingMode,
  participant: Participant
) => {
  toastQueue.add(
    {
      participant,
      mode,
      type: NotificationType.RecordingSaving,
    },
    { timeout: NotificationDuration.RECORDING_SAVING }
  )
}
