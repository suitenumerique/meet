import { useEffect } from 'react'
import { keyboardShortcutsStore } from '@/stores/keyboardShortcuts'
import { formatShortcutKey } from '@/features/shortcuts/utils'
import { Shortcut } from '@/features/shortcuts/types'

export type useRegisterKeyboardShortcutProps = {
  shortcut?: Shortcut
  handler: () => Promise<void | boolean | undefined> | void
  isDisabled?: boolean
}

export const useRegisterKeyboardShortcut = ({
  shortcut,
  handler,
  isDisabled = false,
}: useRegisterKeyboardShortcutProps) => {
  useEffect(() => {
    if (!shortcut) return
    const formattedKey = formatShortcutKey(shortcut)
    if (isDisabled) {
      keyboardShortcutsStore.shortcuts.delete(formattedKey)
    } else {
      keyboardShortcutsStore.shortcuts.set(formattedKey, handler)
    }
  }, [handler, shortcut, isDisabled])
}
