import { Shortcut } from './types'

// Central list of current keyboard shortcuts. This will feed the future
// tooltip/panel so there is a single source of truth for display and, later,
// customization.
export type ShortcutCategory = 'navigation' | 'media' | 'interaction'

export type ShortcutId =
  | 'open-shortcuts'
  | 'focus-toolbar'
  | 'toggle-microphone'
  | 'toggle-camera'
  | 'push-to-talk'
  | 'reaction'
  | 'fullscreen'
  | 'recording'
  | 'raise-hand'
  | 'toggle-chat'
  | 'toggle-participants'
  | 'open-shortcuts-settings'

export const getShortcutById = (id: ShortcutId) =>
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
    id: 'open-shortcuts',
    category: 'navigation',
    shortcut: { key: '/', ctrlKey: true },
  },
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
    shortcut: { key: 'C', ctrlKey: true, shiftKey: true },
  },
  {
    id: 'toggle-participants',
    category: 'interaction',
    shortcut: { key: 'P', ctrlKey: true, shiftKey: true },
  },
  {
    id: 'open-shortcuts-settings',
    category: 'navigation',
    shortcut: { key: 'K', ctrlKey: true, altKey: true },
  },
]
