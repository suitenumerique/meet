import { useEffect, useRef, type RefObject } from 'react'

type Options = {
  /** Remap the captured trigger (e.g. when it unmounts on click). */
  resolveTrigger?: (activeEl: HTMLElement | null) => HTMLElement | null
}

/**
 * `useRestoreFocus`: captures and restores focus via the PiP
 * document instead of the main one.
 */
export const usePipRestoreFocus = (
  ref: RefObject<HTMLElement | null>,
  isOpen: boolean,
  { resolveTrigger }: Options = {}
) => {
  const prevOpenRef = useRef(false)
  const triggerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const doc = ref.current?.ownerDocument
    const wasOpen = prevOpenRef.current
    prevOpenRef.current = isOpen

    if (!doc) return

    if (!wasOpen && isOpen) {
      const activeEl = doc.activeElement as HTMLElement | null
      triggerRef.current = resolveTrigger ? resolveTrigger(activeEl) : activeEl
      return
    }

    if (wasOpen && !isOpen) {
      const trigger = triggerRef.current
      triggerRef.current = null
      if (trigger && doc.contains(trigger)) {
        requestAnimationFrame(() => trigger.focus({ preventScroll: true }))
      }
    }
  }, [ref, isOpen, resolveTrigger])
}
