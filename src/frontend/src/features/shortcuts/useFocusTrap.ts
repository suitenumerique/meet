import { RefObject, useEffect } from 'react'

type UseFocusTrapOptions = {
  isActive: boolean
  fallbackRef?: RefObject<HTMLElement>
}

const focusableSelector =
  'button:not([disabled]):not([hidden]):not([aria-hidden="true"]), [href]:not([disabled]):not([hidden]):not([aria-hidden="true"]), input:not([disabled]):not([hidden]):not([aria-hidden="true"]), select:not([disabled]):not([hidden]):not([aria-hidden="true"]), textarea:not([disabled]):not([hidden]):not([aria-hidden="true"]), [tabindex]:not([tabindex="-1"]):not([disabled]):not([hidden]):not([aria-hidden="true"])'

// Adds a simple focus trap on the given container: Tab/Shift+Tab loop inside.
export const useFocusTrap = (
  containerRef: RefObject<HTMLElement>,
  { isActive, fallbackRef }: UseFocusTrapOptions
) => {
  useEffect(() => {
    if (!isActive) return
    const container = containerRef.current
    if (!container) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const focusable =
        container.querySelectorAll<HTMLElement>(focusableSelector)
      const fallback = fallbackRef?.current ?? container

      if (focusable.length === 0) {
        e.preventDefault()
        fallback.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (e.shiftKey) {
        if (active === first || active === container) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    container.addEventListener('keydown', handleKeyDown)
    return () => {
      container.removeEventListener('keydown', handleKeyDown)
    }
  }, [containerRef, fallbackRef, isActive])
}
