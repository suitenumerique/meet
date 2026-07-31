import { proxy } from 'valtio'
import type { useChat } from '@livekit/components-react'
import type { ReceivedChatMessage } from '@livekit/components-core'

type ChatApi = ReturnType<typeof useChat>

/**
 * Blobs held by the browser through `URL.createObjectURL` are unreachable by
 * the garbage collector, so the number retained is capped explicitly.
 */
export const MAX_RETAINED_MEDIA = 50

type ChatRowBase = {
  id: string
  identity?: string
  timestamp: number
  hideMetadata: boolean
  isLocal: boolean
}

export type ChatTextRow = ChatRowBase & {
  kind: 'text'
  message: string
}

export type ChatMediaStatus = 'receiving' | 'ready' | 'failed'

export type ChatMediaError = 'transfer_failed' | 'decode_failed' | 'expired'

export type ChatMediaRow = ChatRowBase & {
  kind: 'media'
  caption: string
  mimeType: string
  size: number
  width?: number
  height?: number
  status: ChatMediaStatus
  /** Between 0 and 1, or undefined while the total size is unknown. */
  progress?: number
  objectUrl?: string
  error?: ChatMediaError
}

export type ChatRow = ChatTextRow | ChatMediaRow

export type PendingAttachment = {
  /**
   * Wrapped in valtio's `ref`. A File keeps its bytes in an internal slot that
   * a proxy cannot forward, so proxying one breaks its methods.
   */
  file: File
  previewUrl: string
  width: number
  height: number
}

type State = {
  unreadMessages: number
  isSending: boolean
  isPreparing: boolean
  rows: ChatRow[]
  names: Record<string, string>
  send?: ChatApi['send']
  textAreaValue: string
  pendingAttachment?: PendingAttachment
}

const initialState: State = {
  unreadMessages: 0,
  isSending: false,
  isPreparing: false,
  rows: [],
  names: {},
  send: undefined,
  textAreaValue: '',
  pendingAttachment: undefined,
}

export const chatStore = proxy<State>({ ...initialState })

const GROUPING_WINDOW_MS = 60_000

/**
 * Consecutive rows from the same participant within the grouping window repeat
 * no name header. Shared by every row kind so an image sent right after a
 * message groups with it.
 */
function shouldHideMetadata(identity: string | undefined, timestamp: number) {
  const prev = chatStore.rows[chatStore.rows.length - 1]
  return (
    !!prev &&
    prev.identity === identity &&
    timestamp - prev.timestamp < GROUPING_WINDOW_MS
  )
}

let lastReadTimestamp = 0
let isChatVisible = false

function countAsUnread(row: ChatRow) {
  if (isChatVisible) {
    lastReadTimestamp = row.timestamp
    return
  }
  if (row.timestamp > lastReadTimestamp) chatStore.unreadMessages += 1
}

/**
 * Unread is counted over rows rather than over LiveKit's `chatMessages`: byte
 * streams never appear in `chatMessages`, and rows are the only place that sees
 * both kinds.
 */
export function setChatVisibility(visible: boolean) {
  isChatVisible = visible
  if (!visible) return
  const last = chatStore.rows[chatStore.rows.length - 1]
  if (last) lastReadTimestamp = last.timestamp
  chatStore.unreadMessages = 0
}

export function appendRow(msg: ReceivedChatMessage) {
  const p = msg.from
  if (p) chatStore.names[p.identity] = p.name || p.identity

  const identity = p?.identity
  const timestamp = msg.timestamp

  const row: ChatTextRow = {
    kind: 'text',
    id: msg.id ?? `${timestamp}`,
    identity,
    isLocal: p?.isLocal ?? false,
    message: msg.message,
    timestamp,
    hideMetadata: shouldHideMetadata(identity, timestamp),
  }

  chatStore.rows.push(row)
  countAsUnread(row)
}

function revokeMediaRow(row: ChatMediaRow) {
  if (!row.objectUrl) return
  URL.revokeObjectURL(row.objectUrl)
  row.objectUrl = undefined
  row.status = 'failed'
  row.error = 'expired'
}

/**
 * Drops the oldest blobs once more than `MAX_RETAINED_MEDIA` are held, marking
 * their rows expired rather than leaving a broken image behind.
 */
export function enforceMediaRetention() {
  const retained = chatStore.rows.filter(
    (row): row is ChatMediaRow => row.kind === 'media' && !!row.objectUrl
  )
  for (let i = 0; i < retained.length - MAX_RETAINED_MEDIA; i++) {
    revokeMediaRow(retained[i])
  }
}

export const persistTextAreaValue = (value: string) => {
  chatStore.textAreaValue = value
}

export const clearTextAreaValue = () => {
  chatStore.textAreaValue = ''
}

export function resetChatStore() {
  for (const row of chatStore.rows) {
    if (row.kind === 'media' && row.objectUrl)
      URL.revokeObjectURL(row.objectUrl)
  }
  if (chatStore.pendingAttachment) {
    URL.revokeObjectURL(chatStore.pendingAttachment.previewUrl)
  }
  lastReadTimestamp = 0
  isChatVisible = false
  Object.assign(chatStore, {
    ...initialState,
    rows: [],
    names: {},
  })
}
