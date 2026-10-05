// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { chatStore, resetChatStore } from '@/stores/chat'
import { BreakoutRoomTracker } from './BreakoutRoomTracker'
import { NotificationType } from '@/features/notifications/NotificationType'

/* eslint-disable @typescript-eslint/no-explicit-any */
const h = vi.hoisted(() => ({
  me: 'alice',
  metadata: '',
  toasts: [] as any[],
  sound: vi.fn(),
  permissionCalls: [] as boolean[],
  connection: 'connected',
  mic: vi.fn(),
  micOn: true,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { room?: string }) =>
      values?.room ? `${key} ${values.room}` : key,
  }),
}))
vi.mock('@livekit/components-react', () => ({
  useRoomContext: () => ({
    localParticipant: {
      identity: h.me,
      setMicrophoneEnabled: h.mic,
      get isMicrophoneEnabled() {
        return h.micOn
      },
    },
  }),
  useRoomInfo: () => ({ metadata: h.metadata }),
  useConnectionState: () => h.connection,
}))
vi.mock('../hooks/useBreakoutMediaPermissions', () => ({
  useBreakoutMediaPermissions: (restrictedBeforeConnect: boolean) =>
    h.permissionCalls.push(restrictedBeforeConnect),
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

const showing = (metadata: string, restrictedBeforeConnect = true) => {
  h.metadata = metadata
  return (
    <BreakoutRoomTracker restrictedBeforeConnect={restrictedBeforeConnect} />
  )
}

afterEach(() => {
  cleanup()
  h.me = 'alice'
  h.toasts = []
  h.sound.mockReset()
  h.permissionCalls = []
  h.connection = 'connected'
  h.mic.mockReset()
  h.micOn = true
})

describe('BreakoutRoomTracker', () => {
  it('announces the room it moves into, with a sound', () => {
    const { rerender } = render(showing(''))
    rerender(showing(split))
    expect(h.toasts).toEqual([
      {
        type: NotificationType.BreakoutRoomChanged,
        room: 'Room 1',
        muted: true,
      },
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

  it('turns the microphone off at every change of room, and says so', () => {
    const { rerender } = render(showing(''))
    rerender(showing(split))
    expect(h.mic).toHaveBeenCalledTimes(1)
    rerender(showing(''))
    expect(h.mic).toHaveBeenCalledTimes(2)
    expect(h.toasts.map((toast) => toast.muted)).toEqual([true, true])
  })

  it('marks in the chat each change of who the messages reach', () => {
    resetChatStore()
    const { rerender } = render(showing(''))
    rerender(showing(split))
    rerender(showing(''))
    expect(chatStore.rows.map((row) => row.divider)).toEqual([
      'chatRoom Room 1',
      'chatAll',
    ])
  })

  it('says nothing about a microphone already off', () => {
    h.micOn = false
    const { rerender } = render(showing(''))
    rerender(showing(split))
    expect(h.mic).not.toHaveBeenCalled()
    expect(h.toasts).toMatchObject([{ room: 'Room 1', muted: false }])
  })

  it('leaves the microphone of someone already in the main room alone', () => {
    h.me = 'host'
    const { rerender } = render(showing(split))
    rerender(showing(''))
    expect(h.mic).not.toHaveBeenCalled()
  })

  it('hides the banner while the connection is down', () => {
    h.connection = 'reconnecting'
    render(showing(split))
    expect(screen.queryByText('currentRoom Room 1')).toBeNull()
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
    expect(h.permissionCalls).toEqual([])
    rerender(showing('', true))
    expect(h.permissionCalls.at(-1)).toBe(true)
  })

  it('announces the rooms closing to everyone', () => {
    h.me = 'host'
    const { rerender } = render(showing(split))
    rerender(showing(''))
    expect(h.toasts).toEqual([
      { type: NotificationType.BreakoutRoomChanged, room: null, muted: false },
    ])
    expect(screen.queryByText('mainRoom')).toBeNull()
  })
})
