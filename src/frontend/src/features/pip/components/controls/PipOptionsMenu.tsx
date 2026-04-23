import { useEffect, useRef, useState } from 'react'
import { RiMoreFill } from '@remixicon/react'
import { FocusScope } from '@react-aria/focus'
import { Box, Button } from '@/primitives'
import { css } from '@/styled-system/css'
import { useTranslation } from 'react-i18next'
import { PipOptionsMenuItems } from './PipOptionsMenuItems'
import { useEscapeDismiss } from '@/features/pip/hooks/useEscapeDismiss'
import type { CollapsibleControl } from '../PipControlBar'

type PipOptionsMenuProps = {
  overflowControls?: Set<CollapsibleControl>
}

/**
 * PiP-native options menu. The shared `Menu` primitive mis-positions its
 * popover and loses focus across documents, so we drive open/close, focus
 * and dismissal ourselves.
 */
export const PipOptionsMenu = ({ overflowControls }: PipOptionsMenuProps) => {
  const { t } = useTranslation('rooms')
  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const label = t('options.buttonLabel')

  useEscapeDismiss(wrapperRef, isOpen, () => {
    setIsOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  })

  useEffect(() => {
    if (!isOpen) return
    const doc = wrapperRef.current?.ownerDocument ?? document

    const handleMenuItemClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      const wrapper = wrapperRef.current
      if (!wrapper || !target) return
      if (wrapper.querySelector('button')?.contains(target)) return
      if (target.closest('[role="menuitem"]')) {
        requestAnimationFrame(() => {
          setIsOpen(false)
          triggerRef.current?.focus()
        })
      }
    }

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      const wrapper = wrapperRef.current
      if (!wrapper || !target) return
      if (wrapper.contains(target)) return
      setIsOpen(false)
    }

    doc.addEventListener('click', handleMenuItemClick, true)
    doc.addEventListener('mousedown', handleOutsideClick, true)
    return () => {
      doc.removeEventListener('click', handleMenuItemClick, true)
      doc.removeEventListener('mousedown', handleOutsideClick, true)
    }
  }, [isOpen])

  return (
    <div
      ref={wrapperRef}
      className={css({
        position: 'relative',
      })}
    >
      <Button
        ref={triggerRef}
        id="room-options-trigger"
        square
        variant="primaryDark"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        tooltip={label}
        onPress={() => setIsOpen(!isOpen)}
      >
        <RiMoreFill />
      </Button>
      {isOpen && (
        <div
          className={css({
            position: 'absolute',
            left: '50%',
            bottom: 'calc(100% + 0.85rem)',
            transform: 'translateX(-50%)',
            zIndex: 10,
          })}
        >
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <FocusScope autoFocus>
            <Box size="sm" type="popover" variant="dark">
              <PipOptionsMenuItems overflowControls={overflowControls} />
            </Box>
          </FocusScope>
        </div>
      )}
    </div>
  )
}
