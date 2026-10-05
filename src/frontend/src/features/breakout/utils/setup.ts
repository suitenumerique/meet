import { ParticipantKind, type Participant } from 'livekit-client'
import { getParticipantIsRoomAdminOrOwner } from '@/features/rooms/utils/getParticipantIsRoomAdminOrOwner'
import type { BreakoutPerson } from '../api'

export const MIN_ROOMS = 2

// Only browsers keep themselves to a room: phone callers and agents stay.
// Hosts, this browser included, can be placed too, though never at random.
export const isAssignable = (p: Participant) =>
  p.isLocal || p.kind === ParticipantKind.STANDARD

export const isHost = getParticipantIsRoomAdminOrOwner

// Room index per identity; an index past the room count means unassigned.
export type Assignments = Record<string, number>

export const shuffleAssignments = (
  identities: string[],
  roomCount: number,
  random: () => number = Math.random
): Assignments => {
  const order = [...identities]
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return Object.fromEntries(order.map((id, i) => [id, i % roomCount]))
}

export const buildRooms = (
  roomNames: string[],
  people: BreakoutPerson[],
  assignments: Assignments
) =>
  roomNames.map((name, index) => ({
    name,
    participants: people.filter((p) => assignments[p.identity] === index),
  }))
