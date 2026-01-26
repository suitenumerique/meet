import { Participant } from 'livekit-client'
import { getParticipantIsRoomAdmin } from '@/features/rooms/utils/getParticipantIsRoomAdmin'

/**
 * Hook to check if a specific participant is an owner/admin of the room.
 * Uses the room_admin attribute set by the backend on the LiveKit participant.
 * @param participant The LiveKit participant to check
 * @returns true if the participant is an owner/admin, false otherwise
 */
export const useIsParticipantOwner = (participant: Participant): boolean => {
  return getParticipantIsRoomAdmin(participant)
}
