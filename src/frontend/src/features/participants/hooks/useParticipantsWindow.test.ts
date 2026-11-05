import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  container: null as HTMLElement | null,
  setContainer: vi.fn(),
}))

vi.mock('react', async (importOriginal) => {
  const original = await importOriginal<typeof import('react')>()
  return {
    ...original,
    useCallback: (fn: unknown) => fn,
    useEffect: (fn: () => void | (() => void)) => state.effects.push(fn),
    useRef: (value: unknown) => ({ current: value }),
    useState: () => [state.container, state.setContainer],
  }
})
vi.mock('react-dom', () => ({ flushSync: (fn: () => void) => fn() }))
vi.mock('valtio', () => ({ useSnapshot: () => ({ participant: null }) }))
vi.mock('@/stores/muteDialog', () => ({
  muteDialogStore: { participant: null },
}))
vi.mock('@/stores/layout', () => ({
  layoutStore: { activePanelId: null, activeSubPanelId: null },
}))
vi.mock('@/features/rooms/livekit/hooks/useSidePanel', () => ({
  PanelId: { PARTICIPANTS: 'participants' },
}))

import { layoutStore } from '@/stores/layout'
import { useParticipantsWindow } from './useParticipantsWindow'

const fakePopup = () => {
  const root = { style: {} }
  const document = {
    title: '',
    documentElement: {
      lang: '',
      className: '',
      style: { cssText: '' },
      dataset: {},
    },
    head: { appendChild: vi.fn() },
    body: { style: {}, appendChild: vi.fn() },
    createElement: vi.fn(() => root),
    querySelector: vi.fn(() => ({ focus: vi.fn() })),
  }
  return {
    closed: false,
    document,
    focus: vi.fn(),
    close: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
}

describe('useParticipantsWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.effects.length = 0
    state.setContainer.mockReset()
    state.container = null
    layoutStore.activePanelId = 'participants' as never
    layoutStore.activeSubPanelId = null
    vi.stubGlobal('requestAnimationFrame', (fn: () => void) => fn())
    vi.stubGlobal('HTMLElement', class HTMLElement {})
    vi.stubGlobal('document', {
      activeElement: null,
      documentElement: {
        lang: 'fr',
        className: '',
        style: { cssText: '' },
        dataset: {},
      },
      head: { querySelectorAll: () => [] },
      querySelector: vi.fn(() => ({ focus: vi.fn() })),
    })
  })

  it('keeps the panel visible when the browser blocks pop-ups', () => {
    vi.stubGlobal('window', { open: vi.fn(() => null) })
    const { open } = useParticipantsWindow()
    expect(open('Participants')).toBe(false)
    expect(layoutStore.activePanelId).toBe('participants')
    expect(state.setContainer).not.toHaveBeenCalled()
  })

  it('opens one same-origin window without creating another room', () => {
    const popup = fakePopup()
    const opener = vi.fn(() => popup)
    vi.stubGlobal('window', {
      open: opener,
      focus: vi.fn(),
      addEventListener: vi.fn(),
    })
    const { open } = useParticipantsWindow()
    expect(open('Participants')).toBe(true)
    expect(open('Participants')).toBe(true)
    expect(opener).toHaveBeenCalledTimes(1)
    expect(opener).toHaveBeenCalledWith(
      '',
      '_blank',
      expect.stringContaining('popup=yes')
    )
    expect(popup.document.title).toBe('Participants')
    expect(popup.document.body.appendChild).toHaveBeenCalled()
    expect(state.setContainer).toHaveBeenCalledTimes(1)
    expect(layoutStore.activePanelId).toBeNull()
  })

  it('restores the participants panel and closes the popup', () => {
    const popup = fakePopup()
    vi.stubGlobal('window', {
      open: vi.fn(() => popup),
      focus: vi.fn(),
      addEventListener: vi.fn(),
    })
    const { open, close } = useParticipantsWindow()
    expect(open('Participants')).toBe(true)
    close()
    expect(layoutStore.activePanelId).toBe('participants')
    expect(popup.close).toHaveBeenCalledOnce()
    expect(state.setContainer).toHaveBeenLastCalledWith(null)
  })

  it('restores focus to the button that opened the separate window', () => {
    const popup = fakePopup()
    const control = Object.assign(new HTMLElement(), {
      isConnected: true,
      focus: vi.fn(),
    })
    Object.defineProperty(document, 'activeElement', {
      configurable: true,
      value: control,
    })
    vi.stubGlobal('window', {
      open: vi.fn(() => popup),
      focus: vi.fn(),
      addEventListener: vi.fn(),
    })
    const { open, close } = useParticipantsWindow()
    expect(open('Participants')).toBe(true)
    close()
    expect(control.focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('closes the popup without reopening the panel during a meeting teardown', () => {
    const popup = fakePopup()
    vi.stubGlobal('window', {
      open: vi.fn(() => popup),
      focus: vi.fn(),
      addEventListener: vi.fn(),
    })
    const { open, close } = useParticipantsWindow()
    open('Participants')
    close(false)
    expect(layoutStore.activePanelId).toBeNull()
    expect(popup.close).toHaveBeenCalledOnce()
  })
})
