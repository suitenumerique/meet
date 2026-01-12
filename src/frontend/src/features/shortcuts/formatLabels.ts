import { Shortcut } from './types'
import { isMacintosh } from '@/utils/livekit'

// Visible label for a shortcut (uses ⌘/Ctrl prefix when needed).
export const formatShortcutLabel = (shortcut?: Shortcut) => {
  if (!shortcut) return '—'
  const key = shortcut.key?.toUpperCase()
  if (!key) return '—'
  if (shortcut.ctrlKey) return `${isMacintosh() ? '⌘' : 'Ctrl'}+${key}`
  return key
}

// SR-friendly label for a shortcut (reads “Control plus D”).
export const formatShortcutLabelForSR = (
  shortcut: Shortcut | undefined,
  {
    controlLabel,
    commandLabel,
    plusLabel,
    noShortcutLabel,
  }: {
    controlLabel: string
    commandLabel: string
    plusLabel: string
    noShortcutLabel: string
  }
) => {
  if (!shortcut) return noShortcutLabel
  const key = shortcut.key?.toUpperCase()
  if (!key) return noShortcutLabel
  const ctrlWord = isMacintosh() ? commandLabel : controlLabel
  if (shortcut.ctrlKey) return `${ctrlWord} ${plusLabel} ${key}`
  return key
}

// Extract displayable key name from KeyboardEvent.code (ex: KeyV -> V).
export const getKeyLabelFromCode = (code?: string) => {
  if (!code) return ''
  if (code.startsWith('Key') && code.length === 4) return code.slice(3)
  return code
}

// Long-press label (visual or SR), e.g. “Hold V”.
export const formatLongPressLabel = (
  codeLabel: string,
  holdTemplate: string
) => {
  if (!codeLabel) return holdTemplate.replace('{{key}}', '?')
  return holdTemplate.replace('{{key}}', codeLabel)
}
