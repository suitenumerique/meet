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

const message = (identity: string, timestamp: number) => ({
  id: `${identity}-${timestamp}`,
  timestamp,
  message: `from ${identity}`,
  from: { identity, name: identity, isLocal: false },
})

const mount = (metadata: string, messages: unknown[] = [], me = 'alice') => {
  h.metadata = metadata
  h.messages = messages
  h.send = vi.fn(async () => ({}))
  h.room = {
    metadata,
    localParticipant: {
      identity: me,
      isLocal: true,
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

afterEach(cleanup)

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
