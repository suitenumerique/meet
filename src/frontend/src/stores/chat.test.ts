import { beforeEach, describe, expect, it } from 'vitest'
import type { ReceivedChatMessage } from '@livekit/components-core'
import {
  appendNewMessages,
  appendReceivingMediaRow,
  chatStore,
  resetChatStore,
  resolveMediaRow,
} from './chat'

const message = (id: string, text: string) =>
  ({
    id,
    message: text,
    timestamp: Date.now(),
    from: { identity: 'alice', name: 'Alice', isLocal: false },
  }) as unknown as ReceivedChatMessage

const image = (id: string) => ({
  id,
  identity: 'bob',
  caption: '',
  mimeType: '',
  width: 1,
  height: 100000,
})

const texts = () =>
  chatStore.rows.flatMap((row) => (row.kind === 'text' ? [row.message] : []))

describe('chat rows', () => {
  beforeEach(() => resetChatStore())

  it('copies every text message, whatever images arrived between them', () => {
    const messages = [message('1', 'before')]
    appendNewMessages(messages)
    appendReceivingMediaRow(image('img'))
    messages.push(message('2', 'after'), message('3', 'later'))
    appendNewMessages(messages)
    expect(texts()).toEqual(['before', 'after', 'later'])
  })

  it('refuses a stream id another row already holds', () => {
    expect(appendReceivingMediaRow(image('img'))).toBe(true)
    expect(
      appendReceivingMediaRow({ ...image('img'), identity: 'mallory' })
    ).toBe(false)
    expect(chatStore.rows).toHaveLength(1)
  })

  it('replaces the declared size with the decoded one', () => {
    appendReceivingMediaRow(image('img'))
    resolveMediaRow('img', 'blob:img', 'image/png', { width: 64, height: 48 })
    const row = chatStore.rows[0]
    expect(row.kind === 'media' && [row.width, row.height]).toEqual([64, 48])
  })
})
