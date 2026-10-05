// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { ChatProvider } from './ChatProvider'
import { chatStore } from '@/stores/chat'

/* eslint-disable @typescript-eslint/no-explicit-any */
const h = vi.hoisted(() => ({
  metadata: '',
  messages: [] as any[],
  send: undefined as any,
  room: undefined as any,
}))

vi.mock('@livekit/components-react', () => ({
  useChat: () => ({ send: h.send, chatMessages: h.messages, isSending: false }),
  useRoomContext: () => h.room,
  useRoomInfo: () => ({ metadata: h.metadata }),
}))
vi.mock('@/features/rooms/livekit/hooks/useSidePanel', () => ({
  useSidePanel: () => ({ isChatOpen: false }),
}))

const split = JSON.stringify({
  breakout: {
    session_id: 's1',
    rooms: ['Room 1', 'Room 2'],
    assignments: { alice: 0, bob: 0, carol: 1 },
  },
})

const message = (
  identity: string,
  timestamp: number,
  { role = 'member', toEveryRoom = false } = {}
) => ({
  id: `${identity}-${timestamp}`,
  timestamp,
  message: `from ${identity}`,
  from: {
    identity,
    name: identity,
    isLocal: false,
    attributes: { room_role: role },
  },
  attributes: toEveryRoom ? { 'breakout.to_every_room': 'true' } : undefined,
})

const mount = (
  metadata: string,
  messages: unknown[] = [],
  me = 'alice',
  role = 'member'
) => {
  h.metadata = metadata
  h.messages = messages
  h.send = vi.fn(async () => ({}))
  h.room = {
    metadata,
    localParticipant: {
      identity: me,
      isLocal: true,
      attributes: { room_role: role },
      sendText: vi.fn(async () => ({ id: 'sent' })),
    },
    remoteParticipants: new Map(
      ['alice', 'bob', 'carol']
        .filter((identity) => identity !== me)
        .map((identity) => [identity, { identity, kind: 0 }])
    ),
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  }
  return render(<ChatProvider />)
}

afterEach(() => {
  cleanup()
  chatStore.toEveryRoom = false
})

describe('ChatProvider', () => {
  it('sends to the whole meeting outside a split', async () => {
    mount('')
    await chatStore.send?.('hello')
    expect(h.send).toHaveBeenCalledWith('hello', undefined)
  })

  it('sends to the room only in a split, and nothing to the meeting', async () => {
    mount(split)
    await chatStore.send?.('hello')
    expect(h.room.localParticipant.sendText).toHaveBeenCalledWith('hello', {
      topic: 'lk.chat',
      destinationIdentities: ['bob'],
    })
    // useChat's send carries a copy to the whole meeting.
    expect(h.send).not.toHaveBeenCalled()
    expect(chatStore.rows).toMatchObject([{ id: 'sent', isLocal: true }])
  })

  it('counts none of its own messages as unread', async () => {
    const { rerender } = mount(split)
    await chatStore.send?.('hello')
    h.messages = [message('bob', 2)]
    rerender(<ChatProvider />)
    expect(chatStore.unreadMessages).toBe(1)
  })

  it('sends to nobody from a room of one', async () => {
    // An empty list would reach everyone; the sender's own identity reaches nobody.
    mount(split, [], 'carol')
    await chatStore.send?.('hello')
    expect(h.room.localParticipant.sendText).toHaveBeenCalledWith('hello', {
      topic: 'lk.chat',
      destinationIdentities: ['carol'],
    })
  })

  it('never shows or counts a message from another room', () => {
    mount(split, [message('carol', 1), message('bob', 2)])
    expect(chatStore.rows.map((row) => row.identity)).toEqual(['bob'])
    expect(chatStore.unreadMessages).toBe(1)
    expect(h.room.emit).toHaveBeenCalledTimes(1)
  })

  it('shows a host message sent to every room, in any room', () => {
    mount(split, [message('host', 1, { role: 'owner', toEveryRoom: true })])
    expect(chatStore.rows).toMatchObject([
      { identity: 'host', toEveryRoom: true },
    ])
  })

  it('starts a new group when a host switches between every room and this one', () => {
    mount(
      split,
      [
        message('host', 1, { role: 'owner', toEveryRoom: true }),
        message('host', 2, { role: 'owner' }),
      ],
      'dan'
    )
    expect(chatStore.rows).toMatchObject([
      { toEveryRoom: true, hideMetadata: false },
      { toEveryRoom: false, hideMetadata: false },
    ])
  })

  it('drops a guest message marked for every room', () => {
    mount(split, [message('carol', 1, { toEveryRoom: true })])
    expect(chatStore.rows).toEqual([])
  })

  it('sends to every room from a host in the main room with the switch on', async () => {
    mount(split, [], 'host', 'owner')
    chatStore.toEveryRoom = true
    await chatStore.send?.('hello')
    expect(h.room.localParticipant.sendText).toHaveBeenCalledWith('hello', {
      topic: 'lk.chat',
      attributes: { 'breakout.to_every_room': 'true' },
    })
    expect(chatStore.rows).toMatchObject([{ toEveryRoom: true }])
  })

  it('keeps a guest in the main room to the main room, the switch on or not', async () => {
    mount(split, [], 'dan')
    chatStore.toEveryRoom = true
    await chatStore.send?.('hello')
    const [, options] = h.room.localParticipant.sendText.mock.calls[0]
    expect(options.destinationIdentities).toBeDefined()
    expect(options.attributes).toBeUndefined()
  })

  it('sends an ordinary message from a host outside a split, the switch on', async () => {
    mount('', [], 'host', 'owner')
    chatStore.toEveryRoom = true
    await chatStore.send?.('hello')
    expect(h.send).toHaveBeenCalledWith('hello', undefined)
    expect(h.room.localParticipant.sendText).not.toHaveBeenCalled()
  })

  it('keeps a host assigned to a room in that room, the switch on', async () => {
    const hostInRoom = JSON.stringify({
      breakout: {
        session_id: 's1',
        rooms: ['Room 1'],
        assignments: { host: 0, alice: 0 },
      },
    })
    mount(hostInRoom, [], 'host', 'owner')
    chatStore.toEveryRoom = true
    await chatStore.send?.('hello')
    const [, options] = h.room.localParticipant.sendText.mock.calls[0]
    expect(options.destinationIdentities).toEqual(['alice'])
    expect(options.attributes).toBeUndefined()
  })

  it('turns Send to every room off when the rooms close', () => {
    const { rerender } = mount(split, [], 'host', 'owner')
    chatStore.toEveryRoom = true
    h.metadata = ''
    h.room.metadata = ''
    rerender(<ChatProvider />)
    expect(chatStore.toEveryRoom).toBe(false)
  })

  it('announces a message once, whatever the split does after', () => {
    const { rerender } = mount('', [message('bob', 1)])
    expect(h.room.emit).toHaveBeenCalledTimes(1)

    h.metadata = split
    h.room.metadata = split
    rerender(<ChatProvider />)
    h.metadata = ''
    h.room.metadata = ''
    rerender(<ChatProvider />)

    expect(h.room.emit).toHaveBeenCalledTimes(1)
    expect(chatStore.unreadMessages).toBe(1)
  })
})
