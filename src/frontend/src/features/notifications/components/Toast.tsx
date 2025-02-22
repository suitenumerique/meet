import { useToast } from '@react-aria/toast'
import { Button } from '@/primitives'
import { RiCloseLine } from '@remixicon/react'
import { ToastState } from '@react-stately/toast'
import { styled } from '@/styled-system/jsx'
import { useRef } from 'react'
import { ToastData } from './ToastProvider'
import type { QueuedToast } from '@react-stately/toast'

export const StyledToastContainer = styled('div', {
  base: {
    margin: 0.5,
    boxShadow:
      'rgba(0, 0, 0, 0.5) 0px 4px 8px 0px, rgba(0, 0, 0, 0.3) 0px 6px 20px 4px',
    backgroundColor: '#494c4f',
    color: 'white',
    borderRadius: '8px',
    '&[data-entering]': { animation: 'fade 200ms' },
    '&[data-exiting]': { animation: 'fade 150ms reverse ease-in' },
    width: 'fit-content',
    marginLeft: 'auto',
  },
})

export const StyledToast = styled('div', {
  base: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '1rem',
    padding: '10px',
  },
})

export interface ToastProps {
  key: string
  toast: QueuedToast<ToastData>
  state: ToastState<ToastData>
}

export function Toast({ state, ...props }: ToastProps) {
  const ref = useRef(null)
  const { toastProps, contentProps, closeButtonProps } = useToast(
    props,
    state,
    ref
  )
  return (
    <StyledToastContainer {...toastProps} ref={ref}>
      <StyledToast>
        <div {...contentProps}>{props.toast.content?.message} machine a</div>
        <Button square size="sm" invisible {...closeButtonProps}>
          <RiCloseLine color="white" />
        </Button>
      </StyledToast>
    </StyledToastContainer>
  )
}
