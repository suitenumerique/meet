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
}

type State = {
  unreadMessages: number
  isSending: boolean
  rows: ChatRow[]
  names: Record<string, string>
  send?: ChatApi['send']
  textAreaValue: string
}

const initialState: State = {
  unreadMessages: 0,
  isSending: false,
  rows: [],
  names: {},
  send: undefined,
  textAreaValue: '',
}

export const chatStore = proxy<State>({ ...initialState })

const GROUPING_WINDOW_MS = 60_000

export function appendRow(msg: ReceivedChatMessage) {
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
    hideMetadata:
      !!prev &&
      prev.identity === identity &&
      msg.timestamp - prev.timestamp < GROUPING_WINDOW_MS,
  })
}

export const persistTextAreaValue = (value: string) => {
  chatStore.textAreaValue = value
}

export const clearTextAreaValue = () => {
  chatStore.textAreaValue = ''
}

export function resetChatStore() {
  console.count('resetChatStore')
  Object.assign(chatStore, {
    ...initialState,
    rows: [],
    names: {},
  })
}
