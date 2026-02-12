import { isMacintosh } from '@/utils/livekit'
import { Shortcut } from '@/features/shortcuts/types'

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
