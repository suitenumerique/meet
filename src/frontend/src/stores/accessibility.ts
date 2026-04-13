import { proxy, subscribe } from 'valtio'
import { STORAGE_KEYS } from '@/utils/storageKeys'
import { deserializeToProxyMap } from '@/utils/valtio'

export type UiFont =
  | 'default'
  | 'lexend'
  | 'atkinson-hyperlegible'
  | 'opendyslexic'

export const UI_FONT_OPTIONS: UiFont[] = [
  'default',
  'lexend',
  'atkinson-hyperlegible',
  'opendyslexic',
]

const SYSTEM_SANS_STACK = [
  'ui-sans-serif',
  'system-ui',
  '-apple-system',
  'BlinkMacSystemFont',
  '"Segoe UI"',
  'Roboto',
  '"Helvetica Neue"',
  'Arial',
  '"Noto Sans"',
  'sans-serif',
].join(', ')

export const UI_FONT_STACKS: Record<UiFont, string> = {
  default: SYSTEM_SANS_STACK,
  lexend: `"Lexend Variable", ${SYSTEM_SANS_STACK}`,
  'atkinson-hyperlegible': `"Atkinson Hyperlegible Next", ${SYSTEM_SANS_STACK}`,
  opendyslexic: `OpenDyslexic, ${SYSTEM_SANS_STACK}`,
}

export type CaptionTextSize = 'small' | 'medium' | 'large'

export const CAPTION_TEXT_SIZE_OPTIONS: CaptionTextSize[] = [
  'small',
  'medium',
  'large',
]

export type CaptionColor =
  | 'default'
  | 'white'
  | 'black'
  | 'blue'
  | 'green'
  | 'red'
  | 'yellow'
  | 'cyan'
  | 'magenta'

export const CAPTION_COLOR_OPTIONS: CaptionColor[] = [
  'default',
  'white',
  'black',
  'blue',
  'green',
  'red',
  'yellow',
  'cyan',
  'magenta',
]

export const CAPTION_FONT_COLOR_VALUES: Record<CaptionColor, string> = {
  default: '#FFFFFF',
  white: '#FFFFFF',
  black: '#000000',
  blue: '#0000FF',
  green: '#00FF00',
  red: '#FF0000',
  yellow: '#FFFF00',
  cyan: '#00FFFF',
  magenta: '#FF00FF',
}

export const CAPTION_BACKGROUND_COLOR_VALUES: Record<CaptionColor, string> = {
  default: 'rgba(0, 0, 0, 0.75)',
  black: 'rgba(0, 0, 0, 0.75)',
  white: 'rgba(255, 255, 255, 0.75)',
  blue: 'rgba(0, 0, 255, 0.75)',
  green: 'rgba(0, 255, 0, 0.75)',
  red: 'rgba(255, 0, 0, 0.75)',
  yellow: 'rgba(255, 255, 0, 0.75)',
  cyan: 'rgba(0, 255, 255, 0.75)',
  magenta: 'rgba(255, 0, 255, 0.75)',
}

type AccessibilityState = {
  announceReactions: boolean
  captionTextSize: CaptionTextSize
  captionFontColor: CaptionColor
  captionBackgroundColor: CaptionColor
  uiFont: UiFont
}

const DEFAULT_STATE: AccessibilityState = {
  announceReactions: false,
  captionTextSize: 'medium',
  captionFontColor: 'default',
  captionBackgroundColor: 'default',
  uiFont: 'default',
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
      const captionFontColor = CAPTION_COLOR_OPTIONS.includes(
        parsed.captionFontColor
      )
        ? parsed.captionFontColor
        : DEFAULT_STATE.captionFontColor
      const captionBackgroundColor = CAPTION_COLOR_OPTIONS.includes(
        parsed.captionBackgroundColor
      )
        ? parsed.captionBackgroundColor
        : DEFAULT_STATE.captionBackgroundColor
      const uiFont = UI_FONT_OPTIONS.includes(parsed.uiFont)
        ? parsed.uiFont
        : DEFAULT_STATE.uiFont
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
        uiFont,
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
