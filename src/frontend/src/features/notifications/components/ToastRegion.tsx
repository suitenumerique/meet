import { AriaToastRegionProps, useToastRegion } from '@react-aria/toast'
import type { ToastState } from '@react-stately/toast'
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

export function ToastRegion({ state, ...props }: ToastRegionProps) {
  const ref = useRef(null)
  const { regionProps } = useToastRegion(props, state, ref)
  return (
    <div {...regionProps} ref={ref} className="toast-region">
      {state.visibleToasts.map((toast) => {
        if (toast.content?.type === NotificationType.ParticipantJoined) {
          return <ToastJoined key={toast.key} toast={toast} state={state} />
        }
        if (toast.content?.type === NotificationType.HandRaised) {
          return <ToastRaised key={toast.key} toast={toast} state={state} />
        }
        if (toast.content?.type === NotificationType.ParticipantMuted) {
          return <ToastMuted key={toast.key} toast={toast} state={state} />
        }
        if (toast.content?.type === NotificationType.MessageReceived) {
          return (
            <ToastMessageReceived key={toast.key} toast={toast} state={state} />
          )
        }
        if (toast.content?.type === NotificationType.LowerHand) {
          return <ToastLowerHand key={toast.key} toast={toast} state={state} />
        }
        return <Toast key={toast.key} toast={toast} state={state} />
      })}
    </div>
  )
}
