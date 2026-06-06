import { useToast } from 'react-aria'
import { Button } from '@/primitives'
import { RiCloseLine } from '@remixicon/react'
import { useRef } from 'react'
import type { ToastState } from 'react-stately'
import type { ToastData } from './ToastProvider'
import type { QueuedToast } from 'react-stately'
import { StyledToastContainer } from './StyledToastContainer'
import { StyledToast } from './StyledToast'

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
    <StyledToastContainer {...toastProps} ref={ref}>
      <StyledToast>
        <div {...contentProps}>{props.toast.content?.message}</div>
        <Button square size="sm" invisible {...closeButtonProps}>
          <RiCloseLine color="white" />
        </Button>
      </StyledToast>
    </StyledToastContainer>
  )
}
