import { isMacintosh } from '@/utils/livekit'
import { Shortcut } from '@/features/shortcuts/types'
import { ShortcutId, ShortcutDescriptor } from './catalog'

export const CTRL = 'ctrl'

export const formatShortcutKey = (shortcut: Shortcut) => {
  const parts = []
  if (shortcut.ctrlKey) parts.push(CTRL)
  if (shortcut.altKey) parts.push('alt')
  if (shortcut.shiftKey) parts.push('shift')
  parts.push(shortcut.key.toUpperCase())
  return parts.join('+')
}

export const appendShortcutLabel = (label: string, shortcut: Shortcut) => {
  if (!shortcut.key) return
  const parts: string[] = []
  if (shortcut.ctrlKey) {
    parts.push(isMacintosh() ? '⌘' : 'Ctrl')
  }
  if (shortcut.altKey) {
    parts.push(isMacintosh() ? '⌥' : 'Alt')
  }
  if (shortcut.shiftKey) {
    parts.push('Shift')
  }
  parts.push(shortcut.key.toLowerCase())
  const formattedKeyLabel = parts.join('+')
  return `${label} (${formattedKeyLabel})`
}

/**
 * Resolves the effective shortcut for a given shortcutId by checking overrides first,
 * then falling back to the catalog default.
 * @param shortcutId - The shortcut identifier
 * @param overrides - Map of shortcut overrides
 * @param getShortcutById - Function to lookup shortcuts from the catalog
 * @returns The effective shortcut (override if present, otherwise catalog default)
 */
export const getEffectiveShortcut = (
  shortcutId: ShortcutId,
  overrides: Map<string, Shortcut>,
  getShortcutById: (id: ShortcutId) => ShortcutDescriptor | undefined
): Shortcut | undefined => {
  const override = overrides.get(shortcutId)
  if (override) return override
  const catalogItem = getShortcutById(shortcutId)
  return catalogItem?.shortcut
}
