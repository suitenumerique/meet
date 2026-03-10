import { proxy, subscribe } from 'valtio'
import { STORAGE_KEYS } from '@/utils/storageKeys'
import { deserializeToProxyMap } from '@/utils/valtio'

export type CaptionTextSize = 'small' | 'medium' | 'large'

export const CAPTION_TEXT_SIZE_OPTIONS: CaptionTextSize[] = [
  'small',
  'medium',
  'large',
]

export type CaptionFontColor =
  | 'white'
  | 'yellow'
  | 'green'
  | 'cyan'
  | 'blue'
  | 'magenta'
  | 'red'
  | 'black'

export const CAPTION_FONT_COLOR_OPTIONS: CaptionFontColor[] = [
  'white',
  'yellow',
  'green',
  'cyan',
  'blue',
  'magenta',
  'red',
  'black',
]

export const CAPTION_FONT_COLOR_VALUES: Record<CaptionFontColor, string> = {
  white: '#FFFFFF',
  yellow: '#FFFF00',
  green: '#00FF00',
  cyan: '#00FFFF',
  blue: '#0000FF',
  magenta: '#FF00FF',
  red: '#FF0000',
  black: '#000000',
}

export type CaptionBackgroundColor =
  | 'black'
  | 'white'
  | 'red'
  | 'green'
  | 'blue'
  | 'yellow'
  | 'cyan'
  | 'magenta'
  | 'transparent'

export const CAPTION_BACKGROUND_COLOR_OPTIONS: CaptionBackgroundColor[] = [
  'black',
  'white',
  'red',
  'green',
  'blue',
  'yellow',
  'cyan',
  'magenta',
  'transparent',
]

export const CAPTION_BACKGROUND_COLOR_VALUES: Record<
  CaptionBackgroundColor,
  string
> = {
  black: 'rgba(0, 0, 0, 0.75)',
  white: 'rgba(255, 255, 255, 0.75)',
  red: 'rgba(255, 0, 0, 0.75)',
  green: 'rgba(0, 255, 0, 0.75)',
  blue: 'rgba(0, 0, 255, 0.75)',
  yellow: 'rgba(255, 255, 0, 0.75)',
  cyan: 'rgba(0, 255, 255, 0.75)',
  magenta: 'rgba(255, 0, 255, 0.75)',
  transparent: 'transparent',
}

type AccessibilityState = {
  announceReactions: boolean
  captionTextSize: CaptionTextSize
  captionFontColor: CaptionFontColor
  captionBackgroundColor: CaptionBackgroundColor
}

const DEFAULT_STATE: AccessibilityState = {
  announceReactions: false,
  captionTextSize: 'medium',
  captionFontColor: 'white',
  captionBackgroundColor: 'black',
}

function getAccessibilityState(): AccessibilityState {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.ACCESSIBILITY)
    if (stored) {
      const parsed = JSON.parse(stored)
      const captionTextSize = CAPTION_TEXT_SIZE_OPTIONS.includes(
        parsed.captionTextSize
      )
        ? parsed.captionTextSize
        : DEFAULT_STATE.captionTextSize
      const captionFontColor = CAPTION_FONT_COLOR_OPTIONS.includes(
        parsed.captionFontColor
      )
        ? parsed.captionFontColor
        : DEFAULT_STATE.captionFontColor
      const captionBackgroundColor =
        CAPTION_BACKGROUND_COLOR_OPTIONS.includes(
          parsed.captionBackgroundColor
        )
          ? parsed.captionBackgroundColor
          : DEFAULT_STATE.captionBackgroundColor
      return {
        ...DEFAULT_STATE,
        ...parsed,
        announceReactions:
          typeof parsed.announceReactions === 'boolean'
            ? parsed.announceReactions
            : DEFAULT_STATE.announceReactions,
        captionTextSize,
        captionFontColor,
        captionBackgroundColor,
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
