import { ParticipantKind } from 'livekit-client'

// What the backend writes into the meeting's metadata while it is split.
export type BreakoutSignal = {
  session_id: string
  rooms: string[]
  // The index of each assigned identity's room in rooms.
  assignments: Record<string, number>
}

// Everyone with no room, the hosts and phone callers included.
export const MAIN_GROUP = -1

type Person = { identity: string; kind: ParticipantKind }

export const groupOf = (signal: BreakoutSignal | null, identity: string) =>
  signal?.assignments[identity] ?? MAIN_GROUP

export const inSameGroup = (
  signal: BreakoutSignal | null,
  a: string,
  b: string
) => groupOf(signal, a) === groupOf(signal, b)

// Who the media server lets receive my tracks: null lets everyone, outside a
// split. Agents and recorders are never named, so subtitles pause in a split.
export const allowedListeners = (
  signal: BreakoutSignal | null,
  me: string,
  others: Person[]
): string[] | null => {
  if (!signal) return null
  const group = groupOf(signal, me)
  if (group !== MAIN_GROUP) {
    return Object.keys(signal.assignments).filter(
      (identity) => identity !== me && signal.assignments[identity] === group
    )
  }
  return others
    .filter(
      (p) =>
        groupOf(signal, p.identity) === MAIN_GROUP &&
        (p.kind === ParticipantKind.STANDARD || p.kind === ParticipantKind.SIP)
    )
    .map((p) => p.identity)
}

const parseSignal = (metadata?: string): BreakoutSignal | null => {
  let signal: BreakoutSignal | undefined
  try {
    signal = JSON.parse(metadata || '{}')?.breakout
  } catch {
    return null
  }
  return signal?.assignments && Array.isArray(signal.rooms) ? signal : null
}

let last: { metadata?: string; signal: BreakoutSignal | null } = {
  signal: null,
}

// The split announced in the meeting's raw metadata, null outside a split.
// A session's assignments never change, so its first reading is kept: a write
// to another key leaves every filter built on it untouched.
export const readSignal = (metadata?: string): BreakoutSignal | null => {
  if (metadata === last.metadata) return last.signal
  const next = parseSignal(metadata)
  const signal =
    next && next.session_id === last.signal?.session_id ? last.signal : next
  last = { metadata, signal }
  return signal
}

type RoomLike = {
  metadata?: string
  localParticipant: { identity: string }
  remoteParticipants: Map<string, Person>
}

// Who a message from this browser goes to, read at send time: undefined
// reaches everyone, outside a split. An empty list would reach everyone too,
// so a room of one sends to its own identity, which reaches nobody.
export const breakoutRecipients = (room: RoomLike): string[] | undefined => {
  const me = room.localParticipant.identity
  const listeners = allowedListeners(readSignal(room.metadata), me, [
    ...room.remoteParticipants.values(),
  ])
  if (listeners === null) return undefined
  return listeners.length ? listeners : [me]
}
