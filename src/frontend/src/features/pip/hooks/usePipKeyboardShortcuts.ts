import { useEffect, type RefObject } from 'react'
import { keyboardShortcutsStore } from '@/stores/keyboardShortcuts'
import { formatShortcutKey } from '@/features/shortcuts/utils'
import { isMacintosh } from '@/utils/livekit'

/**
 * Mirror the main-window keyboard shortcuts inside the PiP document.
 *
 * The central `useKeyboardShortcuts` hook listens on `window`, which is the
 * main document's window. Keydown events from the PiP document never reach
 * it. This hook attaches the same dispatch logic to the PiP document so that
 * Ctrl+D (mic), Ctrl+E (cam), etc. work identically in both contexts.
 */
export const usePipKeyboardShortcuts = (
  containerRef: RefObject<HTMLElement | null>
) => {
  useEffect(() => {
    const doc = containerRef.current?.ownerDocument
    if (!doc || doc === document) return

    const onKeyDown = (e: KeyboardEvent) => {
      const { key, metaKey, ctrlKey, shiftKey, altKey } = e
      if (!key) return

      const shortcutKey = formatShortcutKey({
        key,
        ctrlKey: ctrlKey || (isMacintosh() && metaKey),
        shiftKey,
        altKey,
      })

      let handler = keyboardShortcutsStore.shortcuts.get(shortcutKey)
      if (!handler && shortcutKey === 'ctrl+shift+?') {
        handler = keyboardShortcutsStore.shortcuts.get('ctrl+shift+/')
      }
      if (!handler) return

      e.preventDefault()
      handler()
    }

    doc.addEventListener('keydown', onKeyDown)
    return () => doc.removeEventListener('keydown', onKeyDown)
  }, [containerRef])
}
