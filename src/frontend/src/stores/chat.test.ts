import { afterEach, describe, expect, it } from 'vitest'
import type { ReceivedChatMessage } from '@livekit/components-core'
import { appendDivider, appendRow, chatStore, resetChatStore } from './chat'

const message = (
  identity: string | undefined,
  timestamp: number
): ReceivedChatMessage =>
  ({
    id: `${identity}-${timestamp}`,
    timestamp,
    message: 'hi',
    from: identity ? { identity, name: identity, isLocal: false } : undefined,
  }) as unknown as ReceivedChatMessage

afterEach(resetChatStore)

describe('chat rows', () => {
  it('groups a second message from the same sender under one header', () => {
    appendRow(message('bob', 1000))
    appendRow(message('bob', 2000))
    expect(chatStore.rows.map((row) => row.hideMetadata)).toEqual([false, true])
  })

  it('starts a new group after a divider, a message with no sender included', () => {
    appendRow(message(undefined, 1000))
    appendDivider('Room 1')
    appendRow(message(undefined, 2000))
    expect(chatStore.rows.at(-1)?.hideMetadata).toBe(false)
  })
})
