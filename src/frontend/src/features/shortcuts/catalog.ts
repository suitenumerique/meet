import { Shortcut } from './types'

// Central list of current keyboard shortcuts.
// Keep a single source of truth for display and, later, customization
export type ShortcutCategory = 'navigation' | 'media' | 'interaction'

export type ShortcutId =
  | 'focus-toolbar'
  | 'toggle-microphone'
  | 'toggle-camera'
  | 'push-to-talk'
  | 'toggle-chat'
  | 'toggle-participants'
  | 'raise-hand'
  | 'recording'
  | 'reaction'
  | 'fullscreen'

export const getShortcutDescriptorById = (id: ShortcutId) =>
  shortcutCatalog.find((item) => item.id === id)

export type ShortcutDescriptor = {
  id: ShortcutId
  category: ShortcutCategory
  shortcut?: Shortcut
  kind?: 'press' | 'longPress'
  code?: string // used when kind === 'longPress' (KeyboardEvent.code)
  description?: string
}

export const shortcutCatalog: ShortcutDescriptor[] = [
  {
    id: 'focus-toolbar',
    category: 'navigation',
    shortcut: { key: 'F2' },
  },
  {
    id: 'toggle-microphone',
    category: 'media',
    shortcut: { key: 'd', ctrlKey: true },
  },
  {
    id: 'toggle-camera',
    category: 'media',
    shortcut: { key: 'e', ctrlKey: true },
  },
  {
    id: 'push-to-talk',
    category: 'media',
    kind: 'longPress',
    code: 'KeyV',
  },
  {
    id: 'reaction',
    category: 'interaction',
    shortcut: { key: 'E', ctrlKey: true, shiftKey: true },
  },
  {
    id: 'fullscreen',
    category: 'interaction',
    shortcut: { key: 'F', ctrlKey: true, shiftKey: true },
  },
  {
    id: 'recording',
    category: 'interaction',
    shortcut: { key: 'L', ctrlKey: true, shiftKey: true },
  },
  {
    id: 'raise-hand',
    category: 'interaction',
    shortcut: { key: 'H', ctrlKey: true, shiftKey: true },
  },
  {
    id: 'toggle-chat',
    category: 'interaction',
    shortcut: { key: 'M', ctrlKey: true, shiftKey: true },
  },
  {
    id: 'toggle-participants',
    category: 'interaction',
    shortcut: { key: 'P', ctrlKey: true, shiftKey: true },
  },
]
