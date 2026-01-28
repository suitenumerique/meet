import { useEffect, useRef } from 'react'
import { useSnapshot } from 'valtio'
import { keyboardShortcutsStore } from '@/stores/keyboardShortcuts'
import {
  formatShortcutKey,
  getEffectiveShortcut,
} from '@/features/shortcuts/utils'
import { Shortcut } from '@/features/shortcuts/types'
import { ShortcutId, getShortcutById } from './catalog'
import {
  loadShortcutOverrides,
  shortcutOverridesStore,
} from '@/stores/shortcutOverrides'

export type useRegisterKeyboardShortcutProps = {
  shortcut?: Shortcut
  shortcutId?: ShortcutId
  fallbackShortcut?: Shortcut
  handler: () => Promise<void | boolean | undefined> | void
  isDisabled?: boolean
}

export const useRegisterKeyboardShortcut = ({
  shortcut,
  shortcutId,
  fallbackShortcut,
  handler,
  isDisabled = false,
}: useRegisterKeyboardShortcutProps) => {
  const { overrides } = useSnapshot(shortcutOverridesStore)
  const previousKeyRef = useRef<string | null>(null)
  const unmountKeyRef = useRef<string | null>(null)

  useEffect(() => {
    loadShortcutOverrides()
  }, [])

  useEffect(() => {
    let effectiveShortcut: Shortcut | undefined

    if (shortcutId) {
      // Try override first, then fallback to catalog default
      effectiveShortcut = getEffectiveShortcut(
        shortcutId,
        overrides,
        getShortcutById
      )
    }

    // Fallback to provided shortcuts if no shortcutId or catalog item found
    effectiveShortcut = effectiveShortcut || fallbackShortcut || shortcut

    if (!effectiveShortcut) {
      // Clean up previous shortcut if exists
      if (previousKeyRef.current) {
        keyboardShortcutsStore.shortcuts.delete(previousKeyRef.current)
        previousKeyRef.current = null
      }
      return
    }

    const formattedKey = formatShortcutKey(effectiveShortcut)

    // Capture the key for unmount cleanup at the start of the effect
    unmountKeyRef.current = formattedKey

    // Clean up previous shortcut if the key changed
    if (previousKeyRef.current && previousKeyRef.current !== formattedKey) {
      keyboardShortcutsStore.shortcuts.delete(previousKeyRef.current)
    }

    if (isDisabled) {
      keyboardShortcutsStore.shortcuts.delete(formattedKey)
      previousKeyRef.current = null
    } else {
      keyboardShortcutsStore.shortcuts.set(formattedKey, handler)
      previousKeyRef.current = formattedKey
    }

    // Cleanup function: remove shortcut when component unmounts or dependencies change
    return () => {
      if (unmountKeyRef.current) {
        keyboardShortcutsStore.shortcuts.delete(unmountKeyRef.current)
        unmountKeyRef.current = null
      }
    }
  }, [handler, shortcutId, shortcut, fallbackShortcut, isDisabled, overrides])
}
