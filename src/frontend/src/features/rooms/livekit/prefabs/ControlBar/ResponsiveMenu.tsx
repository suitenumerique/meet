import { css } from '@/styled-system/css'
import { PropsWithChildren } from 'react'
import { Dialog, Modal, ModalOverlay } from 'react-aria-components'

interface ResponsiveMenuProps extends PropsWithChildren {
  isOpened: boolean
  onClosed: () => void
}

export function ResponsiveMenu({
  isOpened,
  onClosed,
  children,
}: ResponsiveMenuProps) {
  return (
    <ModalOverlay
      isDismissable
      isOpen={isOpened}
      onOpenChange={(isOpened) => {
        if (!isOpened) {
          onClosed()
        }
      }}
      className={css({
        width: '100vw',
        height: 'var(--visual-viewport-height)',
        zIndex: 100,
        justifyContent: 'center',
        alignItems: 'flex-end',
        display: 'flex',
        position: 'fixed',
        top: 0,
        left: 0,
        padding: '1.5rem 1.5rem 1rem 1.5rem',
        boxSizing: 'border-box',
      })}
    >
      <Modal
        className={css({
          backgroundColor: 'gray.650',
          borderRadius: '20px',
          flexGrow: 1,
          padding: '1.5rem',
          '&[data-entering]': {
            animation: 'slide-full 200ms',
          },
          '&[data-exiting]': {
            animation: 'slide-full 200ms reverse',
          },
        })}
      >
        <Dialog>{children}</Dialog>
      </Modal>
    </ModalOverlay>
  )
}
