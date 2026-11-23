import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { RoomEvent, type Participant } from 'livekit-client'
import { MainNotificationToast } from './MainNotificationToast'
import { toastQueue } from './components/ToastProvider'
import { NotificationType as Type } from './NotificationType'

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>()
  return {
    handlers,
    room: {
      numParticipants: 2,
      on: (event: string, listener: (...args: unknown[]) => void) => {
        if (!handlers.has(event)) handlers.set(event, new Set())
        handlers.get(event)!.add(listener)
      },
      off: (event: string, listener: (...args: unknown[]) => void) =>
        handlers.get(event)?.delete(listener),
    },
    config: { max_participants_for_sound: 10 },
    layout: { activePanelId: '' },
    sound: vi.fn(),
    announce: vi.fn(),
    translate: (key: string, data?: { count?: number; message?: string }) =>
      `${key}:${data?.count ?? data?.message ?? ''}`,
  }
})
vi.mock('@livekit/components-react', () => ({
  useRoomContext: () => mocks.room,
}))
vi.mock('./hooks/useSoundNotification', () => ({
  useNotificationSound: () => ({
    triggerNotificationSound: (...args: unknown[]) => mocks.sound(...args),
  }),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mocks.translate }),
}))
vi.mock('@/hooks/useScreenReaderAnnounce', () => ({
  useScreenReaderAnnounce: () => mocks.announce,
}))
vi.mock('@/api/useConfig', () => ({
  useConfig: () => ({ data: mocks.config }),
}))
vi.mock('@/stores/layout', () => ({ layoutStore: mocks.layout }))
vi.mock('@/features/rooms/livekit/hooks/useSidePanel', () => ({
  PanelId: { CHAT: 'chat' },
}))
vi.mock('@/features/reactions/hooks/useReactions', () => ({
  useReactions: () => ({ appendReaction: vi.fn() }),
}))
vi.mock('./NotificationProvider', () => ({ NotificationProvider: () => null }))
vi.mock('./components/ToastRegion', () => ({ ToastRegion: () => null }))
vi.mock('./utils', () => ({
  decodeNotificationDataReceived: (value: Uint8Array) =>
    JSON.parse(new TextDecoder().decode(value)),
}))

let renderer: ReactTestRenderer | undefined
const person = (identity: string) =>
  ({ identity, name: identity, isLocal: false }) as Participant
const emit = (event: RoomEvent, ...args: unknown[]) =>
  act(() => {
    for (const handler of mocks.handlers.get(event) ?? []) handler(...args)
  })
const advance = () =>
  act(() => {
    vi.advanceTimersByTime(1000)
  })
beforeEach(() => {
  vi.useFakeTimers()
  mocks.room.numParticipants = 2
  mocks.layout.activePanelId = ''
  mocks.sound.mockClear()
  mocks.announce.mockClear()
  act(() => {
    renderer = create(<MainNotificationToast />)
  })
})
afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  toastQueue.clear()
  mocks.handlers.clear()
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('room notification integration', () => {
  it('groups actual chat events, sounds and screen-reader announcements across renders', () => {
    for (let i = 0; i < 100; i++)
      emit(RoomEvent.ChatMessage, { message: `message ${i}` }, person('alice'))
    act(() => renderer!.update(<MainNotificationToast />))
    expect(mocks.sound).toHaveBeenCalledTimes(1)
    expect(mocks.announce).toHaveBeenCalledTimes(1)
    advance()
    expect(mocks.sound).toHaveBeenCalledTimes(2)
    expect(mocks.announce).toHaveBeenLastCalledWith(
      'messagesSummary:100',
      'polite'
    )
    expect(toastQueue.visibleToasts).toHaveLength(1)
  })

  it('suppresses both joining toasts and sound at the large-room threshold', () => {
    mocks.room.numParticipants = 10
    emit(RoomEvent.ParticipantConnected, person('alice'))
    expect(toastQueue.visibleToasts).toEqual([])
    expect(mocks.sound).not.toHaveBeenCalled()
  })

  it('cancels pending join summaries when a room grows to the threshold', () => {
    emit(RoomEvent.ParticipantConnected, person('alice'))
    emit(RoomEvent.ParticipantConnected, person('bob'))
    mocks.room.numParticipants = 10
    emit(RoomEvent.ParticipantConnected, person('charlie'))
    advance()
    expect(toastQueue.visibleToasts).toEqual([])
    expect(mocks.sound).toHaveBeenCalledTimes(1)
  })

  it('also rechecks room size at the trailing flush', () => {
    emit(RoomEvent.ParticipantConnected, person('alice'))
    emit(RoomEvent.ParticipantConnected, person('bob'))
    mocks.room.numParticipants = 10
    advance()
    expect(toastQueue.visibleToasts).toEqual([])
    expect(mocks.sound).toHaveBeenCalledTimes(1)
  })

  it('throttles chat sounds with the panel open without toasts or announcements', () => {
    mocks.layout.activePanelId = 'chat'
    for (let i = 0; i < 100; i++)
      emit(RoomEvent.ChatMessage, { message: `${i}` }, person('alice'))
    expect(mocks.sound).toHaveBeenCalledTimes(1)
    advance()
    expect(mocks.sound).toHaveBeenCalledTimes(2)
    expect(mocks.announce).not.toHaveBeenCalled()
    expect(toastQueue.visibleToasts).toEqual([])
  })

  it('does not replay panel-open messages after closing the chat panel', () => {
    mocks.layout.activePanelId = 'chat'
    emit(RoomEvent.ChatMessage, { message: 'first' }, person('alice'))
    emit(RoomEvent.ChatMessage, { message: 'pending' }, person('alice'))
    mocks.layout.activePanelId = ''
    advance()
    expect(toastQueue.visibleToasts).toEqual([])
    expect(mocks.announce).not.toHaveBeenCalled()
  })

  it('keeps other raised hands when the displayed participant lowers theirs', () => {
    const alice = person('alice')
    const bob = person('bob')
    emit(RoomEvent.ParticipantAttributesChanged, { handRaisedAt: 'now' }, alice)
    emit(RoomEvent.ParticipantAttributesChanged, { handRaisedAt: 'now' }, bob)
    emit(RoomEvent.ParticipantAttributesChanged, { handRaisedAt: '' }, alice)
    advance()
    expect(toastQueue.visibleToasts[0].content).toMatchObject({
      count: 1,
      participant: bob,
    })
    expect(mocks.sound).toHaveBeenCalledTimes(1)
    emit(RoomEvent.ParticipantAttributesChanged, { handRaisedAt: 'now' }, bob)
    expect(mocks.sound).toHaveBeenCalledTimes(1)
  })

  it('clears hidden action prompts and pending events on disconnection without actions', () => {
    const action = vi.fn()
    toastQueue.add({ type: Type.LowerHand }, { onClose: action, timeout: 3000 })
    for (let i = 0; i < 6; i++) toastQueue.add({ type: Type.RoleChanged })
    emit(RoomEvent.Disconnected)
    advance()
    expect(toastQueue.visibleToasts).toEqual([])
    expect(action).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('unsubscribes and discards pending messages on unmount', () => {
    emit(RoomEvent.ChatMessage, { message: 'first' }, person('alice'))
    emit(RoomEvent.ChatMessage, { message: 'pending' }, person('alice'))
    act(() => renderer!.unmount())
    renderer = undefined
    advance()
    expect(toastQueue.visibleToasts).toEqual([])
    expect(mocks.sound).toHaveBeenCalledTimes(1)
    expect(
      [...mocks.handlers.values()].every((handlers) => handlers.size === 0)
    ).toBe(true)
  })
})
