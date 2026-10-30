// LiveKit's focus layout splits the stage 1fr / 5fr between the carousel and
// the focused tile. These helpers let the user move that split.

export const DEFAULT_CAROUSEL_RATIO = 1 / 6
export const MAX_CAROUSEL_RATIO = 0.5

// Matches the carousel minWidth set in StageLayout.
export const MIN_CAROUSEL_WIDTH = 200

export const KEYBOARD_STEP = 0.025

// Below this viewport width LiveKit stacks the carousel under the focused
// tile, so there is no vertical split to resize.
export const RESIZABLE_MEDIA_QUERY = '(min-width: 601px)'

export const getMinCarouselRatio = (layoutWidth: number): number => {
  if (layoutWidth <= 0) return DEFAULT_CAROUSEL_RATIO
  return Math.min(MIN_CAROUSEL_WIDTH / layoutWidth, MAX_CAROUSEL_RATIO)
}

export const clampCarouselRatio = (
  ratio: number,
  layoutWidth: number
): number => {
  if (!Number.isFinite(ratio)) return DEFAULT_CAROUSEL_RATIO
  return Math.min(
    Math.max(ratio, getMinCarouselRatio(layoutWidth)),
    MAX_CAROUSEL_RATIO
  )
}
