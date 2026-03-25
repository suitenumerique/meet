import { useEffect } from 'react'
import { keyboardShortcutsStore } from '@/stores/keyboardShortcuts'
import { formatShortcutKey } from '@/features/shortcuts/utils'
import { ShortcutId, getShortcutDescriptorById } from './catalog'

export type useRegisterKeyboardShortcutProps = {
  id?: ShortcutId
  handler: () => Promise<void | boolean | undefined> | void
  isDisabled?: boolean
}

export const useRegisterKeyboardShortcut = ({
  id,
  handler,
  isDisabled = false,
}: useRegisterKeyboardShortcutProps) => {
  useEffect(() => {
    if (!id) return
    const descriptor = getShortcutDescriptorById(id)
    if (!descriptor?.shortcut) return
    const formattedKey = formatShortcutKey(descriptor.shortcut)
    if (isDisabled) {
      keyboardShortcutsStore.shortcuts.delete(formattedKey)
    } else {
      keyboardShortcutsStore.shortcuts.set(formattedKey, handler)
    }
  }, [handler, id, isDisabled])
}
