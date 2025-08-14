import { Participant } from 'livekit-client'

export const getParticipantName = (participant: Participant): string => {
  return participant.name || participant.identity || 'Unknown'
}
