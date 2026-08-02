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
   * Wrapped in valtio's `ref`. A Blob keeps its bytes in an internal slot that
   * a proxy cannot forward, so proxying one breaks its methods.
   */
  blob: Blob
  /** Sniffed from the bytes, never taken from the file extension. */
  mimeType: string
  previewUrl: string
  width: number
  height: number
}

export type ChatMediaFailure =
  | 'type_not_allowed'
  | 'too_large'
  | 'animation_too_large'
  | 'unreadable'
  | 'send_failed'

type State = {
  unreadMessages: number
  isSending: boolean
  isPreparing: boolean
  rows: ChatRow[]
  names: Record<string, string>
  send?: ChatApi['send']
  textAreaValue: string
  pendingAttachment?: PendingAttachment
  mediaFailure?: ChatMediaFailure
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
  mediaFailure: undefined,
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

/**
 * Rows carry an identity; the header shows a display name. Every path that
 * appends a row has to register the name, because a participant whose first
 * act is sending an image would otherwise be labelled with their raw identity
 * until they also sent text.
 */
function rememberName(identity?: string, name?: string) {
  if (identity) chatStore.names[identity] = name || identity
}

export function appendRow(msg: ReceivedChatMessage) {
  const p = msg.from
  if (p) rememberName(p.identity, p.name)

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

export function stageAttachment(attachment: PendingAttachment) {
  clearPendingAttachment()
  chatStore.pendingAttachment = attachment
  chatStore.mediaFailure = undefined
}

export function clearPendingAttachment() {
  const pending = chatStore.pendingAttachment
  if (pending) URL.revokeObjectURL(pending.previewUrl)
  chatStore.pendingAttachment = undefined
}

/**
 * Hands the staged preview URL to the row rather than revoking it, so the
 * sender's own copy renders from bytes already in memory. Byte streams do not
 * echo to their sender, so without this the sender alone would not see it.
 */
export function appendLocalMediaRow({
  name,
  ...row
}: {
  id: string
  identity?: string
  name?: string
  caption: string
  mimeType: string
  size: number
  width?: number
  height?: number
  objectUrl: string
}) {
  const timestamp = Date.now()
  rememberName(row.identity, name)
  chatStore.rows.push({
    kind: 'media',
    isLocal: true,
    status: 'ready',
    timestamp,
    hideMetadata: shouldHideMetadata(row.identity, timestamp),
    ...row,
  })
  chatStore.pendingAttachment = undefined
  enforceMediaRetention()
}

/**
 * Inserted when the stream opens, before any bytes arrive, so a participant
 * sees an image being sent rather than a silence.
 */
export function appendReceivingMediaRow({
  name,
  ...row
}: {
  id: string
  identity?: string
  name?: string
  caption: string
  mimeType: string
  size: number
  width?: number
  height?: number
}) {
  const timestamp = Date.now()
  rememberName(row.identity, name)
  chatStore.rows.push({
    kind: 'media',
    isLocal: false,
    status: 'receiving',
    progress: 0,
    timestamp,
    hideMetadata: shouldHideMetadata(row.identity, timestamp),
    ...row,
  })
  const inserted = chatStore.rows[chatStore.rows.length - 1]
  countAsUnread(inserted)
}

function findMediaRow(id: string) {
  return chatStore.rows.find(
    (row): row is ChatMediaRow => row.kind === 'media' && row.id === id
  )
}

export function updateMediaProgress(id: string, progress: number | undefined) {
  const row = findMediaRow(id)
  if (row) row.progress = progress
}

export function resolveMediaRow(
  id: string,
  objectUrl: string,
  mimeType: string
) {
  const row = findMediaRow(id)
  if (!row) {
    URL.revokeObjectURL(objectUrl)
    return
  }
  // Written from the sniffed bytes, not from what the sender declared.
  row.mimeType = mimeType
  row.objectUrl = objectUrl
  row.status = 'ready'
  row.progress = 1
  enforceMediaRetention()
}

export function failMediaRow(id: string, error: ChatMediaError) {
  const row = findMediaRow(id)
  if (!row) return
  row.status = 'failed'
  row.error = error
  row.progress = undefined
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
