import { proxy } from 'valtio'
import type { Tone } from '@/primitives/tone'

/** Decoration severity the host maps to a themed color in `<SubtitlesToggle/>`. */
export type CaptionButtonTone = Tone

/** A decoration layered onto the CC button, keyed by producer-owned `id`. */
export interface CaptionButtonDecoration {
  id: string
  /** Draw a pulsing "live" ring around the button. */
  live?: boolean
  /** Short text shown in a corner badge (e.g. a source name). */
  badge?: string
  /** Severity used to color the badge + ring via the host tone→token map. */
  tone?: CaptionButtonTone
  /** Overrides the button's aria-label/tooltip while set. */
  label?: string
  /** Optional DOM hook for automation; falls back to `caption-badge-<id>`. */
  testId?: string
}

/** Options accepted by {@link setCaptionDecoration} (everything but the id). */
export type CaptionDecorationOptions = Omit<CaptionButtonDecoration, 'id'>

/** A one-time popover anchored to the CC button. */
export interface CaptionPopover {
  text: string
  testId?: string
}

/** Options accepted by {@link showCaptionPopover}. */
export interface CaptionPopoverOptions {
  text: string
  /** `'per-meeting'` shows it at most once per person per meeting (keyed below). */
  once?: 'per-meeting'
  /** Meeting identity used for the once-per-meeting sessionStorage key. */
  roomId?: string
  testId?: string
}

interface CaptionButtonState {
  decoration?: CaptionButtonDecoration
  popover?: CaptionPopover
}

/** Host-owned valtio store backing the CC-button decoration surface (one button = one slot). */
export const captionButtonStore = proxy<CaptionButtonState>({})

/** Set (or replace) the CC-button decoration; last writer wins. */
export const setCaptionDecoration = (
  id: string,
  opts: CaptionDecorationOptions
): void => {
  captionButtonStore.decoration = { id, ...opts }
}

/** Clear the decoration when it is the one registered under `id`. */
export const clearCaptionDecoration = (id: string): void => {
  if (captionButtonStore.decoration?.id === id) {
    captionButtonStore.decoration = undefined
  }
}

/**
 * Show a popover anchored to the CC button. `once: 'per-meeting'` + `roomId`
 * fires at most once per meeting via a sessionStorage marker; else always shows.
 */
export const showCaptionPopover = (
  id: string,
  opts: CaptionPopoverOptions
): void => {
  if (opts.once === 'per-meeting' && opts.roomId) {
    const key = `meet.captionPopover.${opts.roomId}.${id}`
    try {
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, '1')
    } catch {
      // sessionStorage unavailable (private mode / SSR): fall through and show.
    }
  }
  captionButtonStore.popover = { text: opts.text, testId: opts.testId }
}

/** Dismiss the active popover (called by the host on interaction). */
export const dismissCaptionPopover = (): void => {
  captionButtonStore.popover = undefined
}
