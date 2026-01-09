import { proxy, subscribe } from 'valtio'
import { STORAGE_KEYS } from '@/utils/storageKeys'
import { deserializeToProxyMap } from '@/utils/valtio'

type AccessibilityState = {
  announceReactions: boolean
}

const DEFAULT_STATE: AccessibilityState = {
  announceReactions: false,
}

function getAccessibilityState(): AccessibilityState {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.ACCESSIBILITY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return {
        ...DEFAULT_STATE,
        ...parsed,
        announceReactions:
          typeof parsed.announceReactions === 'boolean'
            ? parsed.announceReactions
            : DEFAULT_STATE.announceReactions,
      }
    }

    // Legacy migration: if the setting was previously stored in notifications
    const legacy = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS)
    if (legacy) {
      try {
        const parsedLegacy = JSON.parse(legacy, deserializeToProxyMap)
        if (typeof parsedLegacy?.announceReactions === 'boolean') {
          const migratedState: AccessibilityState = {
            ...DEFAULT_STATE,
            ...parsedLegacy,
            announceReactions: parsedLegacy.announceReactions,
          }

          try {
            localStorage.setItem(
              STORAGE_KEYS.ACCESSIBILITY,
              JSON.stringify(migratedState)
            )
            localStorage.removeItem(STORAGE_KEYS.NOTIFICATIONS)
          } catch {
            // ignore persistence issues during migration
          }

          return migratedState
        }
      } catch {
        // ignore legacy parsing issues
      }
    }

    return DEFAULT_STATE
  } catch (error: unknown) {
    console.error(
      '[AccessibilityStore] Failed to parse stored settings:',
      error
    )
    return DEFAULT_STATE
  }
}

export const accessibilityStore = proxy<AccessibilityState>(
  getAccessibilityState()
)

subscribe(accessibilityStore, () => {
  localStorage.setItem(
    STORAGE_KEYS.ACCESSIBILITY,
    JSON.stringify(accessibilityStore)
  )
})
