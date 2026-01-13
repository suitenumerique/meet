import { useEffect } from 'react'
import { useSnapshot } from 'valtio'
import { keyboardShortcutsStore } from '@/stores/keyboardShortcuts'
import { isMacintosh } from '@/utils/livekit'
import { formatShortcutKey } from './utils'
import { loadShortcutOverrides } from '@/stores/shortcutOverrides'

export const useKeyboardShortcuts = () => {
  const shortcutsSnap = useSnapshot(keyboardShortcutsStore)

  useEffect(() => {
    loadShortcutOverrides()
    // This approach handles basic shortcuts but isn't comprehensive.
    // Issues might occur. First draft.
    const onKeyDown = async (e: KeyboardEvent) => {
      const { key, metaKey, ctrlKey, shiftKey, altKey } = e
      if (!key) return
      const shortcutKey = formatShortcutKey({
        key,
        ctrlKey: ctrlKey || (isMacintosh() && metaKey),
        shiftKey,
        altKey,
      })
      const shortcut = shortcutsSnap.shortcuts.get(shortcutKey)
      if (!shortcut) return
      e.preventDefault()
      await shortcut()
    }

    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [shortcutsSnap])
}
