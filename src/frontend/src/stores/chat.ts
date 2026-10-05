import { proxy } from 'valtio'
import type { useChat } from '@livekit/components-react'
import type { ReceivedChatMessage } from '@livekit/components-core'

type ChatApi = ReturnType<typeof useChat>

export type ChatRow = {
  id: string
  identity?: string
  message: string
  timestamp: number
  hideMetadata: boolean
  isLocal: boolean
  // Sent by a host in the main room to every breakout room.
  toEveryRoom: boolean
  // A line this browser writes when who its messages reach changes.
  divider?: string
}

type State = {
  unreadMessages: number
  isSending: boolean
  rows: ChatRow[]
  names: Record<string, string>
  send?: ChatApi['send']
  textAreaValue: string
  // The host's switch: the next messages go to every breakout room.
  toEveryRoom: boolean
}

const initialState: State = {
  unreadMessages: 0,
  isSending: false,
  rows: [],
  names: {},
  send: undefined,
  textAreaValue: '',
  toEveryRoom: false,
}

export const chatStore = proxy<State>({ ...initialState })

const GROUPING_WINDOW_MS = 60_000

export function appendRow(msg: ReceivedChatMessage, toEveryRoom = false) {
  const p = msg.from
  if (p) chatStore.names[p.identity] = p.name || p.identity

  const identity = p?.identity
  const prev = chatStore.rows[chatStore.rows.length - 1]

  chatStore.rows.push({
    id: msg.id ?? `${msg.timestamp}`,
    identity,
    isLocal: p?.isLocal ?? false,
    message: msg.message,
    timestamp: msg.timestamp,
    toEveryRoom,
    // A change between every room and this room alone starts a new group.
    hideMetadata:
      !!prev &&
      prev.identity === identity &&
      prev.toEveryRoom === toEveryRoom &&
      msg.timestamp - prev.timestamp < GROUPING_WINDOW_MS,
  })
}

// Written by this browser, so it never counts as unread.
export function appendDivider(label: string) {
  const timestamp = Date.now()
  chatStore.rows.push({
    id: `divider-${timestamp}`,
    message: '',
    timestamp,
    hideMetadata: true,
    isLocal: true,
    toEveryRoom: false,
    divider: label,
  })
}

export const persistTextAreaValue = (value: string) => {
  chatStore.textAreaValue = value
}

export const clearTextAreaValue = () => {
  chatStore.textAreaValue = ''
}

export function resetChatStore() {
  Object.assign(chatStore, {
    ...initialState,
    rows: [],
    names: {},
  })
}
