import { useEffect, useRef } from 'react'

export type RestoreFocusOptions = {
  resolveTrigger?: (activeEl: HTMLElement | null) => HTMLElement | null
  onOpened?: () => void
  onClosed?: () => void
  restoreFocusRaf?: boolean
  preventScroll?: boolean
/**
 * When the panel stays open but its content changes (e.g. switching from Admin to Participants),
 * update which trigger button should receive focus on close.
 */
  activeKey?: string | null
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
    activeKey,
  } = options

  const prevIsOpenRef = useRef(false)
  const prevActiveKeyRef = useRef(activeKey)
  const triggerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const wasOpen = prevIsOpenRef.current

    // Just opened
    if (!wasOpen && isOpen) {
      const activeEl = document.activeElement as HTMLElement | null
      triggerRef.current = resolveTrigger ? resolveTrigger(activeEl) : activeEl
      onOpened?.()
    }

    // Panel switched while staying open
    if (wasOpen && isOpen && activeKey !== prevActiveKeyRef.current) {
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
    prevActiveKeyRef.current = activeKey
  }, [
    isOpen,
    activeKey,
    onClosed,
    onOpened,
    preventScroll,
    resolveTrigger,
    restoreFocusRaf,
  ])
}
