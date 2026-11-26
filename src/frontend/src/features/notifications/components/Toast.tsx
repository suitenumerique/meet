import { useToast } from 'react-aria'
import { useRef } from 'react'
import type { ToastState } from 'react-stately'
import type { ToastData } from './ToastProvider'
import type { QueuedToast } from 'react-stately'
import { ToastCard } from './ToastCard'

export interface ToastProps {
  key: string
  toast: QueuedToast<ToastData>
  state: ToastState<ToastData>
}

export function Toast({ state, ...props }: Readonly<ToastProps>) {
  const ref = useRef(null)
  const { toastProps, contentProps, closeButtonProps } = useToast(
    props,
    state,
    ref
  )
  return (
    <ToastCard
      {...toastProps}
      ref={ref}
      contentProps={contentProps}
      closeButtonProps={closeButtonProps}
    >
      {props.toast.content?.message}
    </ToastCard>
  )
}
