import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  captionButtonStore,
  setCaptionDecoration,
  clearCaptionDecoration,
  showCaptionPopover,
  dismissCaptionPopover,
} from './captionButtonStore'

/** Minimal in-memory Storage mock (the test runs in the node environment). */
const makeSessionStorage = (): Storage => {
  const m = new Map<string, string>()
  return {
    getItem: (k) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k, v) => {
      m.set(k, String(v))
    },
    removeItem: (k) => {
      m.delete(k)
    },
    clear: () => {
      m.clear()
    },
    key: (i) => Array.from(m.keys())[i] ?? null,
    get length() {
      return m.size
    },
  }
}

beforeEach(() => {
  captionButtonStore.decoration = undefined
  captionButtonStore.popover = undefined
  vi.stubGlobal('sessionStorage', makeSessionStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('captionButtonStore set / clear', () => {
  it('sets the decoration', () => {
    expect(captionButtonStore.decoration).toBeUndefined()
    setCaptionDecoration('acme', { badge: 'Acme' })
    expect(captionButtonStore.decoration).toMatchObject({
      id: 'acme',
      badge: 'Acme',
    })
  })

  it('carries live / tone / label / testId through', () => {
    setCaptionDecoration('acme', {
      live: true,
      badge: 'Acme',
      tone: 'success',
      label: 'Sous-titres Acme',
      testId: 'cc-acme-live',
    })
    expect(captionButtonStore.decoration).toMatchObject({
      live: true,
      tone: 'success',
      label: 'Sous-titres Acme',
      testId: 'cc-acme-live',
    })
  })

  it('leaves optional fields undefined when omitted', () => {
    setCaptionDecoration('acme', { badge: 'Acme' })
    const deco = captionButtonStore.decoration
    expect(deco?.tone).toBeUndefined()
    expect(deco?.label).toBeUndefined()
    expect(deco?.testId).toBeUndefined()
  })

  it('replaces the decoration in place when re-set (last writer wins)', () => {
    setCaptionDecoration('acme', { badge: 'A', tone: 'info' })
    setCaptionDecoration('acme', { badge: 'B', tone: 'success' })
    expect(captionButtonStore.decoration).toMatchObject({
      id: 'acme',
      badge: 'B',
      tone: 'success',
    })
  })

  it('a different id overwrites the single slot', () => {
    setCaptionDecoration('a', { badge: 'A' })
    setCaptionDecoration('b', { badge: 'B' })
    expect(captionButtonStore.decoration?.id).toBe('b')
  })

  it('clears the decoration by its id', () => {
    setCaptionDecoration('acme', { badge: 'Acme' })
    clearCaptionDecoration('acme')
    expect(captionButtonStore.decoration).toBeUndefined()
  })

  it('clear is a no-op for a non-matching id', () => {
    setCaptionDecoration('acme', { badge: 'Acme' })
    clearCaptionDecoration('nope')
    expect(captionButtonStore.decoration?.id).toBe('acme')
  })
})

describe('captionButtonStore popover', () => {
  it('shows a popover and stores its content', () => {
    showCaptionPopover('acme', { text: 'here' })
    expect(captionButtonStore.popover).toMatchObject({ text: 'here' })
  })

  it('carries an optional testId through', () => {
    showCaptionPopover('acme', { text: 'here', testId: 'cc-pop' })
    expect(captionButtonStore.popover?.testId).toBe('cc-pop')
  })

  it('dismiss clears the popover', () => {
    showCaptionPopover('acme', { text: 'here' })
    dismissCaptionPopover()
    expect(captionButtonStore.popover).toBeUndefined()
  })

  it('once=per-meeting shows only once per room+id and sets a marker', () => {
    showCaptionPopover('acme', {
      text: 'here',
      once: 'per-meeting',
      roomId: 'room-1',
    })
    expect(captionButtonStore.popover?.text).toBe('here')
    expect(sessionStorage.getItem('meet.captionPopover.room-1.acme')).toBe('1')

    // Second call for the same room+id is a no-op even after dismissal.
    dismissCaptionPopover()
    showCaptionPopover('acme', {
      text: 'again',
      once: 'per-meeting',
      roomId: 'room-1',
    })
    expect(captionButtonStore.popover).toBeUndefined()
  })

  it('once=per-meeting is keyed per room (a new room shows again)', () => {
    showCaptionPopover('acme', {
      text: 'here',
      once: 'per-meeting',
      roomId: 'room-1',
    })
    dismissCaptionPopover()
    showCaptionPopover('acme', {
      text: 'here',
      once: 'per-meeting',
      roomId: 'room-2',
    })
    expect(captionButtonStore.popover?.text).toBe('here')
    expect(sessionStorage.getItem('meet.captionPopover.room-2.acme')).toBe('1')
  })

  it('without once, always (re)shows and sets no marker', () => {
    showCaptionPopover('acme', { text: 'first' })
    dismissCaptionPopover()
    showCaptionPopover('acme', { text: 'second' })
    expect(captionButtonStore.popover?.text).toBe('second')
    expect(sessionStorage.length).toBe(0)
  })

  it('once without a roomId falls through and shows (no key to gate on)', () => {
    showCaptionPopover('acme', { text: 'here', once: 'per-meeting' })
    expect(captionButtonStore.popover?.text).toBe('here')
    expect(sessionStorage.length).toBe(0)
  })
})
