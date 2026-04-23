import { Emoji } from '@/features/reactions/types'

export const EMOJI_SLOT_WIDTH = 40
export const ARROW_SLOT_WIDTH = 32
export const PILL_HORIZONTAL_PADDING = 12
export const WRAPPER_HORIZONTAL_PADDING = 16

const EMOJIS = Object.values(Emoji)

export type ReactionsPage = {
  visibleEmojis: Emoji[]
  hasOverflow: boolean
  canGoLeft: boolean
  canGoRight: boolean
  visibleCount: number
}

/**
 * Compute how many emojis fit in `availableWidth` and slice the visible page.
 * Arrow slots are reserved only when the list overflows.
 */
export const computeReactionsPage = (
  availableWidth: number,
  pageStart: number
): ReactionsPage => {
  const usableWidth =
    availableWidth - WRAPPER_HORIZONTAL_PADDING - PILL_HORIZONTAL_PADDING
  const maxWithoutArrows = Math.max(
    1,
    Math.floor(usableWidth / EMOJI_SLOT_WIDTH)
  )

  if (EMOJIS.length <= maxWithoutArrows) {
    return {
      visibleEmojis: EMOJIS,
      hasOverflow: false,
      canGoLeft: false,
      canGoRight: false,
      visibleCount: EMOJIS.length,
    }
  }

  const visibleCount = Math.max(
    1,
    Math.floor((usableWidth - ARROW_SLOT_WIDTH * 2) / EMOJI_SLOT_WIDTH)
  )
  const clampedStart = Math.min(
    Math.max(0, pageStart),
    Math.max(0, EMOJIS.length - visibleCount)
  )

  return {
    visibleEmojis: EMOJIS.slice(clampedStart, clampedStart + visibleCount),
    hasOverflow: true,
    canGoLeft: clampedStart > 0,
    canGoRight: clampedStart + visibleCount < EMOJIS.length,
    visibleCount,
  }
}

export const getMaxPageStart = (visibleCount: number): number =>
  Math.max(0, EMOJIS.length - visibleCount)
