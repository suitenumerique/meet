import { proxy, useSnapshot } from 'valtio'

/** Reserved bus-owner id for the built-in native caption source (priority 0). */
export const NATIVE_SOURCE_ID = 'native'

/** Who a caption belongs to (name/color pre-resolved by the source). */
export interface CaptionSpeaker {
  key: string
  name: string
  color?: string
}

/** A source-agnostic caption pushed onto the bus and rendered by the overlay. */
export interface NormalizedCaption {
  id: string
  speaker: CaptionSpeaker
  text: string
  final: boolean
  firstReceivedTime: number
  lastReceivedTime: number
  language?: string
}

/** A bus owner. `token` is an opaque capability from `claim`, required by `release`/`push`. */
export interface Owner {
  id: string
  priority: number
  token: symbol
}

export interface BusState {
  owners: Owner[]
  stream: NormalizedCaption[]
}

/** Cap the retained stream so snapshots stay cheap under frequent partials. */
const STREAM_TAIL = 200

/** Module-level caption bus (single instance, host-owned). */
export const captionBus = proxy<BusState>({
  owners: [],
  stream: [],
})

const topOwner = (): Owner | undefined =>
  captionBus.owners[captionBus.owners.length - 1]

/** Id of the current (top-of-stack) owner, or `null` when the bus is idle. */
export const currentOwnerId = (): string | null => topOwner()?.id ?? null

/** Reactive: true while a plugin (any non-native owner) is on top of the bus. */
export const useCaptionTakeover = (): boolean => {
  const { owners } = useSnapshot(captionBus)
  const topId = owners.length ? owners[owners.length - 1].id : null
  return topId !== null && topId !== NATIVE_SOURCE_ID
}

/**
 * Claim ownership of the bus. Refused only when the current top owner has a
 * strictly-higher priority (equal-or-lower is overridden). On success the new
 * owner is pushed on top and the stream reset.
 */
export const claim = (
  id: string,
  { priority = 10 }: { priority?: number } = {}
): symbol | null => {
  const top = topOwner()
  if (top && top.priority > priority) return null
  const token = Symbol(id)
  captionBus.owners.push({ id, priority, token })
  captionBus.stream = []
  return token
}

/**
 * Release a claimed ownership; no-op for a stale token. The stream is reset only
 * when the TOP owner leaves — a lower owner leaving must not blank the captions
 * currently rendered by the active producer.
 */
export const release = (token: symbol): void => {
  const idx = captionBus.owners.findIndex((o) => o.token === token)
  if (idx === -1) return
  const wasTop = idx === captionBus.owners.length - 1
  captionBus.owners.splice(idx, 1)
  if (wasTop) captionBus.stream = []
}

/**
 * Append captions (top-owner gated). Dedup by `id`: an existing id is replaced in
 * place, so a partial is upgraded by its final version.
 */
export const push = (token: symbol, caps: NormalizedCaption[]): void => {
  const top = topOwner()
  if (!top || top.token !== token) return
  for (const cap of caps) {
    const idx = captionBus.stream.findIndex((c) => c.id === cap.id)
    if (idx === -1) {
      captionBus.stream.push(cap)
    } else {
      captionBus.stream[idx] = cap
    }
  }
  if (captionBus.stream.length > STREAM_TAIL) {
    captionBus.stream.splice(0, captionBus.stream.length - STREAM_TAIL)
  }
}

/** Replace the whole stream (top-owner gated), for producers that re-derive the full list each update. */
export const replace = (token: symbol, caps: NormalizedCaption[]): void => {
  const top = topOwner()
  if (!top || top.token !== token) return
  captionBus.stream =
    caps.length > STREAM_TAIL ? caps.slice(-STREAM_TAIL) : [...caps]
}
