import { toastQueue } from './components/ToastProvider'
import { NotificationType } from './NotificationType'
import { NotificationDuration } from './NotificationDuration'

/** Enqueue a plain toast; the thin surface `host.notify` exposes. */
export const notify = (message: string): void => {
  toastQueue.add(
    { type: NotificationType.Generic, message },
    { timeout: NotificationDuration.MESSAGE }
  )
}
