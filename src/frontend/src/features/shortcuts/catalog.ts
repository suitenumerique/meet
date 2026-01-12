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
    shortcut: { key: '/' },
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
]
