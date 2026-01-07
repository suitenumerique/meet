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

  useEffect(() => {
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
        const focus = () => trigger.focus({ preventScroll })
        if (restoreFocusRaf) requestAnimationFrame(focus)
        else focus()
      }
      triggerRef.current = null
      onClosed?.()
    }

    prevIsOpenRef.current = isOpen
  }, [
    isOpen,
    onClosed,
    onOpened,
    preventScroll,
    resolveTrigger,
    restoreFocusRaf,
  ])
}
