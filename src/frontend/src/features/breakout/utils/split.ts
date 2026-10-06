import { ParticipantKind, type Participant } from 'livekit-client'
import { getParticipantIsRoomAdminOrOwner } from '@/features/rooms/utils/getParticipantIsRoomAdminOrOwner'

// What the backend writes into the meeting's metadata while it is split.
export type BreakoutSplit = {
  session_id: string
  rooms: string[]
  // The index of each assigned identity's room in rooms.
  assignments: Record<string, number>
}

// The room of everyone not assigned one, the hosts and phone callers included.
// The host's setup uses it too, for someone left unassigned.
export const MAIN_ROOM = -1

type Person = { identity: string; kind: ParticipantKind }

export const breakoutRoomOf = (split: BreakoutSplit | null, identity: string) =>
  split?.assignments[identity] ?? MAIN_ROOM

export const inSameBreakoutRoom = (
  split: BreakoutSplit | null,
  a: string,
  b: string
) => breakoutRoomOf(split, a) === breakoutRoomOf(split, b)

// Who the media server lets receive my tracks: null lets everyone, outside a
// split. Agents and recorders are never named, so subtitles pause in a split.
export const allowedListeners = (
  split: BreakoutSplit | null,
  me: string,
  others: Person[]
): string[] | null => {
  if (!split) return null
  const myRoom = breakoutRoomOf(split, me)
  if (myRoom !== MAIN_ROOM) {
    return Object.keys(split.assignments).filter(
      (identity) => identity !== me && split.assignments[identity] === myRoom
    )
  }
  return others
    .filter(
      (p) =>
        breakoutRoomOf(split, p.identity) === MAIN_ROOM &&
        (p.kind === ParticipantKind.STANDARD || p.kind === ParticipantKind.SIP)
    )
    .map((p) => p.identity)
}

const parseSplit = (metadata?: string): BreakoutSplit | null => {
  let split: BreakoutSplit | undefined
  try {
    split = JSON.parse(metadata || '{}')?.breakout
  } catch {
    return null
  }
  return split?.assignments && Array.isArray(split.rooms) ? split : null
}

// The last metadata read, and the split returned for it.
let last: { metadata?: string; split: BreakoutSplit | null } = {
  split: null,
}

// The split announced in the meeting's raw metadata, null outside a split.
// A session's assignments never change, so its first reading is kept and
// returned as the same object: a write to another key, a recording status for
// one, re-runs none of the hooks and filters built on it.
export const readSplit = (metadata?: string): BreakoutSplit | null => {
  if (metadata === last.metadata) return last.split

  let split = parseSplit(metadata)
  const isSameSession =
    split !== null && split.session_id === last.split?.session_id
  if (isSameSession) split = last.split

  last = { metadata, split }
  return split
}

type RoomLike = {
  metadata?: string
  localParticipant: { identity: string }
  remoteParticipants: Map<string, Person>
}

// Who a message from this browser goes to, read at send time.
export const breakoutRecipients = (room: RoomLike): string[] | undefined => {
  const me = room.localParticipant.identity
  const listeners = allowedListeners(readSplit(room.metadata), me, [
    ...room.remoteParticipants.values(),
  ])
  // Outside a split: no recipients, which LiveKit sends to everyone.
  if (listeners === null) return undefined
  // Alone in a room. LiveKit sends a message with an empty recipient list to
  // everyone, so it goes to this browser's own identity, which reaches nobody.
  if (listeners.length === 0) return [me]
  return listeners
}

// The chat attribute a host in the main room sets on a message meant for every
// room. Receivers trust it from an owner or an administrator alone, whose role
// the backend writes into the pass and nobody can change.
export const TO_EVERY_ROOM = 'breakout.to_every_room'

// True for a message a host sent to every room; the same mark from anyone
// else is ignored.
export const isToEveryRoom = (message: {
  attributes?: Record<string, string>
  from?: Participant
}) =>
  message.attributes?.[TO_EVERY_ROOM] === 'true' &&
  !!message.from &&
  getParticipantIsRoomAdminOrOwner(message.from)

// Where a host may send to every room from: a split is open and they are in
// no breakout room.
export const isInMainRoomOfSplit = (
  split: BreakoutSplit | null,
  identity: string
) => split !== null && breakoutRoomOf(split, identity) === MAIN_ROOM
