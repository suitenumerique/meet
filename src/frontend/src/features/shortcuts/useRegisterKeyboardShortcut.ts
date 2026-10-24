import { useEffect } from 'react'
import { keyboardShortcutsStore } from '@/stores/keyboardShortcuts'
import { formatShortcutKey } from '@/features/shortcuts/utils'
import { type ShortcutId, getShortcutDescriptorById } from './catalog'

export type useRegisterKeyboardShortcutProps = {
  id?: ShortcutId
  handler: () => Promise<void | boolean | undefined> | void
  isDisabled?: boolean
  // Opt-in: controls rendered inside menus unmount when the menu closes, and
  // their shortcuts must keep working.
  unregisterOnUnmount?: boolean
}

export const useRegisterKeyboardShortcut = ({
  id,
  handler,
  isDisabled = false,
  unregisterOnUnmount = false,
}: useRegisterKeyboardShortcutProps) => {
  useEffect(() => {
    if (!id) return
    const descriptor = getShortcutDescriptorById(id)
    if (!descriptor?.shortcut) return
    const formattedKey = formatShortcutKey(descriptor.shortcut)
    if (isDisabled) {
      keyboardShortcutsStore.shortcuts.delete(formattedKey)
      return
    }
    keyboardShortcutsStore.shortcuts.set(formattedKey, handler)
    if (!unregisterOnUnmount) return
    return () => {
      if (keyboardShortcutsStore.shortcuts.get(formattedKey) === handler) {
        keyboardShortcutsStore.shortcuts.delete(formattedKey)
      }
    }
  }, [handler, id, isDisabled, unregisterOnUnmount])
}
