import { useEffect, useRef } from 'react'

// Typing in these never opens the rooms; Enter on a button presses that button.
const TYPING = 'input, textarea, select, [contenteditable="true"]'
const CONTROL = 'button, a, [role="option"], [role="radio"], [role="switch"]'

// Enter opens the rooms while focus is on no control, and Ctrl or Cmd with
// Enter opens them from anywhere but a text field.
export const useOpenShortcut = (open: () => void, isEnabled: boolean) => {
  // The listener reads the newest callback, so it is not added again on
  // every render.
  const latest = useRef(open)
  latest.current = open
  useEffect(() => {
    if (!isEnabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.shiftKey || event.altKey) return
      const target = event.target as Element | null
      if (target?.closest(TYPING)) return
      const withModifier = event.ctrlKey || event.metaKey
      if (!withModifier && target?.closest(CONTROL)) return
      event.preventDefault()
      latest.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isEnabled])
}
