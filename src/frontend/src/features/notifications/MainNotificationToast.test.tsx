// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { RoomEvent } from 'livekit-client'
import { MainNotificationToast } from './MainNotificationToast'
import { NotificationType } from './NotificationType'

/* eslint-disable @typescript-eslint/no-explicit-any */
const h = vi.hoisted(() => {
  const listeners = new Map<string, Set<(...args: any[]) => void>>()
  return {
    metadata: '',
    listeners,
    toasts: { add: [] as any[], close: [] as any[], visible: [] as any[] },
    room: {
      localParticipant: { identity: 'alice' },
      on: (event: string, listener: (...args: any[]) => void) => {
        if (!listeners.has(event)) listeners.set(event, new Set())
        listeners.get(event)!.add(listener)
      },
      off: (event: string, listener: (...args: any[]) => void) =>
        listeners.get(event)?.delete(listener),
    },
  }
})

vi.mock('@livekit/components-react', () => ({
  useRoomContext: () => h.room,
  useRoomInfo: () => ({ metadata: h.metadata }),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/api/useConfig', () => ({ useConfig: () => ({ data: undefined }) }))
vi.mock('@/features/notifications/hooks/useSoundNotification', () => ({
  useNotificationSound: () => ({ triggerNotificationSound: vi.fn() }),
}))
vi.mock('@/hooks/useScreenReaderAnnounce', () => ({
  useScreenReaderAnnounce: () => vi.fn(),
}))
vi.mock('@/features/reactions/hooks/useReactions', () => ({
  useReactions: () => ({ appendReaction: vi.fn() }),
}))
vi.mock('./NotificationProvider', () => ({ NotificationProvider: () => null }))
vi.mock('./components/ToastProvider', () => ({
  toastQueue: {
    add: (toast: unknown) => h.toasts.add.push(toast),
    close: (key: unknown) => h.toasts.close.push(key),
    get visibleToasts() {
      return h.toasts.visible
    },
  },
}))

// alice receives; bob shares her room, carol is in the other one, and the
// host stays in the main room.
const split = JSON.stringify({
  breakout: {
    session_id: 's1',
    rooms: ['Room 1', 'Room 2'],
    assignments: { alice: 0, bob: 0, carol: 1 },
  },
})

const person = (identity: string) => ({
  identity,
  name: identity,
  isLocal: false,
})

const fire = (event: RoomEvent, ...args: unknown[]) =>
  h.listeners.get(event)?.forEach((listener) => listener(...args))

const data = (type: NotificationType, extra?: object) =>
  new TextEncoder().encode(JSON.stringify({ type, data: extra }))

beforeEach(() => {
  h.metadata = split
  h.toasts = { add: [], close: [], visible: [] }
  h.listeners.clear()
  render(<MainNotificationToast />)
})

afterEach(cleanup)

describe('MainNotificationToast in a split', () => {
  it('shows a removed source, whoever removed it', () => {
    fire(
      RoomEvent.DataReceived,
      data(NotificationType.PermissionsRemoved, { removedSources: ['camera'] }),
      person('host')
    )
    expect(h.toasts.add).toHaveLength(1)
  })

  it('shows nothing else from outside the room', () => {
    fire(
      RoomEvent.DataReceived,
      data(NotificationType.ParticipantMuted),
      person('host')
    )
    fire(
      RoomEvent.ParticipantAttributesChanged,
      { handRaisedAt: '1' },
      person('carol')
    )
    expect(h.toasts.add).toHaveLength(0)
  })

  it('drops a browser notice from a sender not yet known, but keeps the backend notices', () => {
    fire(
      RoomEvent.DataReceived,
      data(NotificationType.ScreenRecordingRequested)
    )
    expect(h.toasts.add).toHaveLength(0)
    fire(RoomEvent.DataReceived, data(NotificationType.ScreenRecordingFailed))
    expect(h.toasts.add).toHaveLength(1)
  })

  it('toasts a chat message from the room alone', () => {
    fire(RoomEvent.ChatMessage, { message: 'from Room 2' }, person('carol'))
    expect(h.toasts.add).toHaveLength(0)
    fire(RoomEvent.ChatMessage, { message: 'from Room 1' }, person('bob'))
    expect(h.toasts.add.map((toast) => toast.message)).toEqual(['from Room 1'])
  })

  it('toasts a message a host in the main room sent to every room', () => {
    const toEveryRoom = { 'breakout.to_every_room': 'true' }
    const host = { ...person('hana'), attributes: { room_role: 'owner' } }
    const guest = person('dave')
    fire(
      RoomEvent.ChatMessage,
      { message: 'from a guest', attributes: toEveryRoom, from: guest },
      guest
    )
    expect(h.toasts.add).toHaveLength(0)
    fire(
      RoomEvent.ChatMessage,
      { message: '5 minutes left', attributes: toEveryRoom, from: host },
      host
    )
    expect(h.toasts.add.map((toast) => toast.message)).toEqual([
      '5 minutes left',
    ])
  })

  it('takes down a raised hand lowered from another room', () => {
    const carol = person('carol')
    h.toasts.visible = [
      {
        key: 'hand',
        content: { participant: carol, type: NotificationType.HandRaised },
      },
    ]
    fire(RoomEvent.ParticipantAttributesChanged, { handRaisedAt: '' }, carol)
    expect(h.toasts.close).toEqual(['hand'])
  })
})
