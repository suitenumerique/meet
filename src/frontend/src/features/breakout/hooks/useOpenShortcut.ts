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
    const listener = (withModifier: boolean) => (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.shiftKey || event.altKey) return
      if ((event.ctrlKey || event.metaKey) !== withModifier) return
      const target = event.target as Element | null
      if (target?.closest(TYPING)) return
      if (!withModifier && target?.closest(CONTROL)) return
      event.preventDefault()
      if (withModifier) event.stopPropagation()
      latest.current()
    }
    // With a modifier the shortcut listens in the capture phase, since a
    // button stops the Enter it presses; plain Enter waits for the bubble,
    // which a menu item or a tab keeps for itself.
    const withModifier = listener(true)
    const plain = listener(false)
    document.addEventListener('keydown', withModifier, true)
    document.addEventListener('keydown', plain)
    return () => {
      document.removeEventListener('keydown', withModifier, true)
      document.removeEventListener('keydown', plain)
    }
  }, [isEnabled])
}
