/* eslint-disable react-refresh/only-export-components */
import { ToastQueue, type ToastOptions, useToastQueue } from 'react-stately'
import { ToastRegion } from './ToastRegion'
import { Participant } from 'livekit-client'
import type { NotificationType } from '../NotificationType'

export interface ToastData {
  participant?: Participant
  type: NotificationType
  message?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

const MAX_TOASTS = 5

class NotificationToastQueue extends ToastQueue<ToastData> {
  add(content: ToastData, options?: ToastOptions): string {
    // maxVisibleToasts alone leaves older notifications queued out of sight.
    if (this.visibleToasts.length >= MAX_TOASTS) {
      const oldestToast = this.visibleToasts[MAX_TOASTS - 1]
      // Discarding a prompt must not run its action, such as lowering a hand.
      oldestToast.onClose = undefined
      oldestToast.timer?.pause()
      this.close(oldestToast.key)
    }
    return super.add(content, options)
  }
}

export const toastQueue = new NotificationToastQueue({
  maxVisibleToasts: MAX_TOASTS,
})

export const ToastProvider = ({ ...props }) => {
  const state = useToastQueue<ToastData>(toastQueue)
  return (
    <>
      {state.visibleToasts.length > 0 && (
        <ToastRegion {...props} state={state} />
      )}
    </>
  )
}
