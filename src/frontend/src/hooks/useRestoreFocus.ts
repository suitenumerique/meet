import { useEffect, useRef } from 'react'

export type RestoreFocusOptions = {
  resolveTrigger?: (activeEl: HTMLElement | null) => HTMLElement | null
  onOpened?: () => void
  onClosed?: () => void
  restoreFocusRaf?: boolean
  preventScroll?: boolean
}

/**
 * Capture the element that opened a panel/menu (on open transition) and restore focus to it
 * when the panel/menu closes.
 */
export function useRestoreFocus(
  isOpen: boolean,
  options: RestoreFocusOptions = {}
) {
  const {
    resolveTrigger,
    onOpened,
    onClosed,
    restoreFocusRaf = false,
    preventScroll = true,
  } = options

  const prevIsOpenRef = useRef(false)
  const triggerRef = useRef<HTMLElement | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const lastInteractionRef = useRef<'keyboard' | 'mouse' | null>(null)

  useEffect(() => {
    // Track last interaction type (like native :focus-visible behavior)
    const handleKeyDown = () => {
      lastInteractionRef.current = 'keyboard'
    }
    const handleMouseDown = () => {
      lastInteractionRef.current = 'mouse'
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleMouseDown)

    const wasOpen = prevIsOpenRef.current

    // Just opened
    if (!wasOpen && isOpen) {
      const activeEl = document.activeElement as HTMLElement | null
      triggerRef.current = resolveTrigger ? resolveTrigger(activeEl) : activeEl
      onOpened?.()
    }

    // Just closed
    if (wasOpen && !isOpen) {
      const trigger = triggerRef.current
      if (trigger && document.contains(trigger)) {
        const focus = () => {
          trigger.focus({ preventScroll })
          // Only show focus ring if last interaction was keyboard (like native :focus-visible)
          if (lastInteractionRef.current === 'keyboard') {
            trigger.setAttribute('data-restore-focus-visible', '')
            // Remove focus ring only when the trigger loses focus
            const handleBlur = () => {
              if (document.contains(trigger)) {
                trigger.removeAttribute('data-restore-focus-visible')
              }
            }
            trigger.addEventListener('blur', handleBlur, { once: true })
            // Store cleanup for unmount case
            cleanupRef.current?.()
            cleanupRef.current = () => {
              trigger.removeEventListener('blur', handleBlur)
              if (document.contains(trigger)) {
                trigger.removeAttribute('data-restore-focus-visible')
              }
            }
          }
        }
        if (restoreFocusRaf) requestAnimationFrame(focus)
        else focus()
      }
      triggerRef.current = null
      onClosed?.()
    }

    prevIsOpenRef.current = isOpen

    // Cleanup: remove focus ring if component unmounts before focus changes
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleMouseDown)
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [
    isOpen,
    onClosed,
    onOpened,
    preventScroll,
    resolveTrigger,
    restoreFocusRaf,
  ])
}
