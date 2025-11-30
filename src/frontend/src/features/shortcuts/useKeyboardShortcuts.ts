import { useEffect } from 'react'
import { useSnapshot } from 'valtio'
import { keyboardShortcutsStore } from '@/stores/keyboardShortcuts'
import { isMacintosh } from '@/utils/livekit'
import { formatShortcutKey } from './utils'

export const useKeyboardShortcuts = () => {
  const shortcutsSnap = useSnapshot(keyboardShortcutsStore)

  useEffect(() => {
    const onKeyDown = async (e: KeyboardEvent) => {
      const { key, metaKey, ctrlKey } = e
      if (!key) return
      const shortcutKey = formatShortcutKey({
        key,
        ctrlKey: ctrlKey || (isMacintosh() && metaKey),
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
