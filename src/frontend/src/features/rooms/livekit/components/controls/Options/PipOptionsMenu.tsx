import React, { useEffect } from 'react'
import { RiMoreFill } from '@remixicon/react'
import { Box, Button } from '@/primitives'
import { css } from '@/styled-system/css'
import { OptionsMenuItems } from './OptionsMenuItems'

type PipOptionsMenuProps = {
  wrapperRef: React.RefObject<HTMLDivElement>
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  label: string
}

/**
 * PiP-specific options menu with absolute positioning for correct alignment in PiP window.
 * Renders locally (unlike standard Menu) and closes automatically on item click or outside click.
 */
export const PipOptionsMenu = ({
  wrapperRef,
  isOpen,
  setIsOpen,
  label,
}: PipOptionsMenuProps) => {
  // Close menu when a menu item action completes (e.g., transcription, effects, recording).
  useEffect(() => {
    if (!isOpen) return
    const doc = wrapperRef.current?.ownerDocument ?? document

    const handleMenuItemClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      const wrapper = wrapperRef.current
      if (!wrapper || !target) return
      
      // Don't close if clicking the trigger button
      if (wrapper.querySelector('button')?.contains(target)) return
      
      // Close if clicking a menu item (action will have fired)
      if (target.closest('[role="menuitem"]')) {
        // Use requestAnimationFrame to ensure action completes first, without visible delay
        requestAnimationFrame(() => {
          setIsOpen(false)
        })
      }
    }

    doc.addEventListener('click', handleMenuItemClick, true)
    return () => {
      doc.removeEventListener('click', handleMenuItemClick, true)
    }
  }, [isOpen, setIsOpen, wrapperRef])

  return (
    <div
      ref={wrapperRef}
      className={css({
        position: 'relative',
      })}
    >
      <Button
        id="room-options-trigger"
        square
        variant="primaryDark"
        aria-label={label}
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
          <Box size="sm" type="popover" variant="dark">
            <OptionsMenuItems />
          </Box>
        </div>
      )}
    </div>
  )
}