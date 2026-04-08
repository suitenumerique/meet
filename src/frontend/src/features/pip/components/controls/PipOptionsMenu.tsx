import { useEffect, useRef, useState } from 'react'
import { RiMoreFill } from '@remixicon/react'
import { Box, Button } from '@/primitives'
import { css } from '@/styled-system/css'
import { PipOptionsMenuItems } from './PipOptionsMenuItems'
import { useTranslation } from 'react-i18next'
import type { CollapsibleControl } from '../PipControlBar'

type PipOptionsMenuProps = {
  overflowControls?: Set<CollapsibleControl>
}

/**
 * PiP-specific options menu with absolute positioning for correct alignment in PiP window.
 * Renders locally (unlike standard Menu) and closes automatically on item click or outside click.
 * Overflow controls from the toolbar are rendered as additional menu items.
 */
export const PipOptionsMenu = ({ overflowControls }: PipOptionsMenuProps) => {
  const { t } = useTranslation('rooms')
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const label = t('options.buttonLabel')

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
        })
      }
    }

    doc.addEventListener('click', handleMenuItemClick, true)
    return () => {
      doc.removeEventListener('click', handleMenuItemClick, true)
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
            <PipOptionsMenuItems overflowControls={overflowControls} />
          </Box>
        </div>
      )}
    </div>
  )
}
