import { Participant } from 'livekit-client'

export const getParticipantIsRoomAdmin = (
  participant: Participant
): boolean => {
  const attributes = participant.attributes

  if (!attributes) {
    return false
  }
  return attributes?.room_admin === 'true'
}
