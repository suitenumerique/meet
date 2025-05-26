/* eslint-disable react-refresh/only-export-components */
import { ToastQueue, useToastQueue } from '@react-stately/toast'
import { ToastRegion } from './ToastRegion'
import { Participant } from 'livekit-client'
import { NotificationType } from '../NotificationType'

export interface ToastData {
  participant: Participant
  type: NotificationType
  message?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

// Using a global queue for toasts allows for centralized management and queuing of notifications
// from anywhere in the app, providing greater flexibility in complex scenarios.
export const toastQueue = new ToastQueue<ToastData>({
  maxVisibleToasts: 5,
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
