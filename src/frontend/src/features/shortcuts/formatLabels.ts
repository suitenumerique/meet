import { Shortcut } from './types'
import { isMacintosh } from '@/utils/livekit'

// Visible label for a shortcut (uses ⌘/Ctrl prefix when needed).
export const formatShortcutLabel = (shortcut?: Shortcut) => {
  if (!shortcut) return '—'
  const key = shortcut.key?.toUpperCase()
  if (!key) return '—'
  const parts: string[] = []
  if (shortcut.ctrlKey) parts.push(isMacintosh() ? '⌘' : 'Ctrl')
  if (shortcut.altKey) parts.push(isMacintosh() ? '⌥' : 'Alt')
  if (shortcut.shiftKey) parts.push('Shift')
  parts.push(key)
  return parts.join('+')
}

// SR-friendly label for a shortcut (reads "Control plus D").
export const formatShortcutLabelForSR = (
  shortcut: Shortcut | undefined,
  {
    controlLabel,
    commandLabel,
    altLabel,
    optionLabel,
    shiftLabel,
    plusLabel,
    noShortcutLabel,
  }: {
    controlLabel: string
    commandLabel: string
    altLabel: string
    optionLabel: string
    shiftLabel: string
    plusLabel: string
    noShortcutLabel: string
  }
) => {
  if (!shortcut) return noShortcutLabel
  const key = shortcut.key?.toUpperCase()
  if (!key) return noShortcutLabel
  const ctrlWord = isMacintosh() ? commandLabel : controlLabel
  const altWord = isMacintosh() ? optionLabel : altLabel
  const parts: string[] = []
  if (shortcut.ctrlKey) parts.push(ctrlWord)
  if (shortcut.altKey) parts.push(altWord)
  if (shortcut.shiftKey) parts.push(shiftLabel)
  parts.push(key)
  return parts.join(` ${plusLabel} `)
}

// Extract displayable key name from KeyboardEvent.code (ex: KeyV -> V).
export const getKeyLabelFromCode = (code?: string) => {
  if (!code) return ''
  if (code.startsWith('Key') && code.length === 4) return code.slice(3)
  if (code.startsWith('Digit') && code.length === 6) return code.slice(5)
  if (code === 'Space') return '␣'
  if (code.startsWith('Arrow')) return code.slice(5) // Up, Down, Left, Right
  return code
}
