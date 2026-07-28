import type { Participant } from 'livekit-client'
import { ParticipantRole } from '@/features/rooms/api/ApiRoom'

const participantHasRoomRole = (
  participant: Participant,
  roles: ParticipantRole[]
): boolean => {
  const role = participant.attributes?.room_role
  return role !== undefined && roles.includes(role as ParticipantRole)
}

export const getParticipantIsRoomAdmin = (participant: Participant): boolean =>
  participantHasRoomRole(participant, ['administrator'])

export const getParticipantIsRoomOwner = (participant: Participant): boolean =>
  participantHasRoomRole(participant, ['owner'])

export const getParticipantIsRoomMember = (participant: Participant): boolean =>
  participantHasRoomRole(participant, ['member'])

export const getParticipantIsRoomAdminOrOwner = (
  participant: Participant
): boolean => participantHasRoomRole(participant, ['administrator', 'owner'])
