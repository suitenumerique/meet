import { AriaToastRegionProps, useToastRegion } from '@react-aria/toast'
import type { QueuedToast, ToastState } from '@react-stately/toast'
import { Toast } from './Toast'
import { useRef } from 'react'
import { NotificationType } from '../NotificationType'
import { ToastJoined } from './ToastJoined'
import { ToastData } from './ToastProvider'
import { ToastRaised } from './ToastRaised'
import { ToastMuted } from './ToastMuted'
import { ToastMessageReceived } from './ToastMessageReceived'
import { ToastLowerHand } from './ToastLowerHand'

interface ToastRegionProps extends AriaToastRegionProps {
  state: ToastState<ToastData>
}

const renderToast = (
  toast: QueuedToast<ToastData>,
  state: ToastState<ToastData>
) => {
  switch (toast.content?.type) {
    case NotificationType.ParticipantJoined:
      return <ToastJoined key={toast.key} toast={toast} state={state} />

    case NotificationType.HandRaised:
      return <ToastRaised key={toast.key} toast={toast} state={state} />

    case NotificationType.ParticipantMuted:
      return <ToastMuted key={toast.key} toast={toast} state={state} />

    case NotificationType.MessageReceived:
      return (
        <ToastMessageReceived key={toast.key} toast={toast} state={state} />
      )

    case NotificationType.LowerHand:
      return <ToastLowerHand key={toast.key} toast={toast} state={state} />

    default:
      return <Toast key={toast.key} toast={toast} state={state} />
  }
}

export function ToastRegion({ state, ...props }: ToastRegionProps) {
  const ref = useRef(null)
  const { regionProps } = useToastRegion(props, state, ref)
  return (
    <div {...regionProps} ref={ref} className="toast-region">
      {state.visibleToasts.map((toast) => renderToast(toast, state))}
    </div>
  )
}
