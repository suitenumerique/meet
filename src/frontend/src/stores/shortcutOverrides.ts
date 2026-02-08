import { proxy } from 'valtio'
import { Shortcut } from '@/features/shortcuts/types'

const STORAGE_KEY = 'shortcuts:overrides'

type State = {
  overrides: Map<string, Shortcut>
  isLoaded: boolean
}

export const shortcutOverridesStore = proxy<State>({
  overrides: new Map<string, Shortcut>(),
  isLoaded: false,
})

const isValidShortcut = (value: unknown): value is Shortcut => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const shortcut = value as Record<string, unknown>
  if (typeof shortcut.key !== 'string' || shortcut.key.length === 0) {
    return false
  }
  if (shortcut.ctrlKey !== undefined && typeof shortcut.ctrlKey !== 'boolean') {
    return false
  }
  if (
    shortcut.shiftKey !== undefined &&
    typeof shortcut.shiftKey !== 'boolean'
  ) {
    return false
  }
  if (shortcut.altKey !== undefined && typeof shortcut.altKey !== 'boolean') {
    return false
  }
  return true
}

export const loadShortcutOverrides = () => {
  if (shortcutOverridesStore.isLoaded) return
  shortcutOverridesStore.isLoaded = true
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      console.warn('Invalid shortcut overrides format in localStorage')
      return
    }
    Object.entries(parsed).forEach(([id, value]) => {
      if (isValidShortcut(value)) {
        shortcutOverridesStore.overrides.set(id, value)
      } else {
        console.warn(`Skipping invalid shortcut override for "${id}":`, value)
      }
    })
  } catch (e) {
    console.warn('Failed to load shortcut overrides', e)
  }
}

export const getOverride = (id: string): Shortcut | undefined => {
  return shortcutOverridesStore.overrides.get(id)
}

const saveOverridesToStorage = () => {
  if (typeof window === 'undefined') return
  try {
    const overridesObj: Record<string, Shortcut> = {}
    shortcutOverridesStore.overrides.forEach((value, key) => {
      overridesObj[key] = value
    })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overridesObj))
  } catch (e) {
    console.warn('Failed to save shortcut overrides', e)
  }
}

export const setOverride = (id: string, shortcut: Shortcut) => {
  shortcutOverridesStore.overrides.set(id, shortcut)
  // Force reactivity by creating a new Map reference
  shortcutOverridesStore.overrides = new Map(shortcutOverridesStore.overrides)
  saveOverridesToStorage()
}

export const removeOverride = (id: string) => {
  shortcutOverridesStore.overrides.delete(id)
  // Force reactivity by creating a new Map reference
  shortcutOverridesStore.overrides = new Map(shortcutOverridesStore.overrides)
  saveOverridesToStorage()
}
