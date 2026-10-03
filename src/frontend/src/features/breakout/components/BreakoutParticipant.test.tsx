// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { BreakoutParticipant } from './BreakoutParticipant'
import { NotificationType } from '@/features/notifications/NotificationType'

/* eslint-disable @typescript-eslint/no-explicit-any */
const h = vi.hoisted(() => ({
  me: 'alice',
  metadata: '',
  toasts: [] as any[],
  sound: vi.fn(),
  isolation: [] as boolean[],
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { room?: string }) =>
      values?.room ? `${key} ${values.room}` : key,
  }),
}))
vi.mock('@livekit/components-react', () => ({
  useRoomContext: () => ({ localParticipant: { identity: h.me } }),
  useRoomInfo: () => ({ metadata: h.metadata }),
}))
vi.mock('../hooks/useBreakoutIsolation', () => ({
  useBreakoutIsolation: (isolatedOnJoin: boolean) =>
    h.isolation.push(isolatedOnJoin),
}))
vi.mock('@/features/notifications/hooks/useSoundNotification', () => ({
  useNotificationSound: () => ({ triggerNotificationSound: h.sound }),
}))
vi.mock('@/features/notifications/components/ToastProvider', () => ({
  toastQueue: { add: (toast: unknown) => h.toasts.push(toast) },
}))

const split = JSON.stringify({
  breakout: {
    session_id: 's1',
    rooms: ['Room 1', 'Room 2'],
    assignments: { alice: 0 },
  },
})

const showing = (metadata: string, isolatedOnJoin = true) => {
  h.metadata = metadata
  return <BreakoutParticipant isolatedOnJoin={isolatedOnJoin} />
}

afterEach(() => {
  cleanup()
  h.me = 'alice'
  h.toasts = []
  h.sound.mockReset()
  h.isolation = []
})

describe('BreakoutParticipant', () => {
  it('announces the room it moves into, with a sound', () => {
    const { rerender } = render(showing(''))
    rerender(showing(split))
    expect(h.toasts).toEqual([
      { type: NotificationType.BreakoutRoomChanged, room: 'Room 1' },
    ])
    expect(h.sound).toHaveBeenCalledWith(NotificationType.BreakoutRoomChanged)
    expect(screen.getByText('currentRoom Room 1')).toBeTruthy()
  })

  it('shows the main room a banner and no toast', () => {
    h.me = 'host'
    const { rerender } = render(showing(''))
    rerender(showing(split))
    expect(screen.getByText('mainRoom')).toBeTruthy()
    expect(h.toasts).toEqual([])
  })

  it('waits for a split where the flag was off, then stays to announce its end', () => {
    const { rerender } = render(showing('', false))
    expect(h.toasts).toEqual([])
    rerender(showing(split, false))
    rerender(showing('', false))
    expect(h.toasts.map((toast) => toast.room)).toEqual(['Room 1', null])
  })

  it('isolates a tab whose flag turns on after it mounted', () => {
    const { rerender } = render(showing('', false))
    expect(h.isolation).toEqual([])
    rerender(showing('', true))
    expect(h.isolation.at(-1)).toBe(true)
  })

  it('announces the rooms closing to everyone', () => {
    h.me = 'host'
    const { rerender } = render(showing(split))
    rerender(showing(''))
    expect(h.toasts).toEqual([
      { type: NotificationType.BreakoutRoomChanged, room: null },
    ])
    expect(screen.queryByText('mainRoom')).toBeNull()
  })
})
