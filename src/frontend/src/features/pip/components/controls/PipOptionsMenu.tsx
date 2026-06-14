import { useEffect, useRef, useState } from 'react'
import { RiMoreFill } from '@remixicon/react'
import { FocusScope } from '@react-aria/focus'
import { Box, Button } from '@/primitives'
import { css } from '@/styled-system/css'
import { useTranslation } from 'react-i18next'
import { PipOptionsMenuItems } from './PipOptionsMenuItems'
import { useDismissOnEscape } from '../../hooks/useDismissOnEscape'
import { CollapsibleControl } from '@/features/pip/components/PipControlBar'

type PipOptionsMenuProps = {
  overflowControls: Set<CollapsibleControl>
}
/**
 * PiP-native options menu.
 *
 * Why not use the shared `<Menu>` primitive (React Aria's MenuTrigger +
 * Popover)?
 *
 * React Aria positions popovers by reading `window.innerWidth` and
 * `window.innerHeight` to know where the viewport edges are. The problem:
 * it reads them from the *module-global* `window`, which is always the
 * main browser window — even when the trigger button lives inside the
 * Picture-in-Picture window (a separate `document` with its own, smaller
 * viewport). React Aria therefore thinks it has the full main-window
 * space to work with, and places the popover using those coordinates.
 * The result is a menu that appears off-screen, clipped, or in the wrong
 * corner of the PiP.
 *
 * The same single-document assumption breaks focus: React Aria's focus
 * management and outside-click detection listen on the main `document`,
 * so when the user interacts in the PiP, the menu doesn't receive focus
 * on open, Escape doesn't restore focus to the trigger, and clicking
 * outside doesn't dismiss it.
 *
 * These aren't bugs we can fix from the outside — the `window` and
 * `document` references are baked into React Aria internals, with no
 * prop or context to override them.
 *
 * So in PiP we replace the primitive with this component.
 */
export const PipOptionsMenu = ({ overflowControls }: PipOptionsMenuProps) => {
  const { t } = useTranslation('rooms')

  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const [isOpen, setIsOpen] = useState(false)
  const label = t('options.buttonLabel')

  useDismissOnEscape(wrapperRef, isOpen, () => {
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
          {/* eslint-disable-next-line jsx-a11y/no-autofocus*/}
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
