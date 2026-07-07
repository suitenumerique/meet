import type { Participant } from 'livekit-client'

export const getParticipantIsAuthenticated = (
  participant: Participant
): boolean => {
  const isAuthenticated = participant.attributes?.is_authenticated
  return isAuthenticated == 'true'
}
