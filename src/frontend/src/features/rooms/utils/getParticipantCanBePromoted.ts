import { Participant } from 'livekit-client'

/**
 * Checks if a participant can be promoted to owner.
 * Anonymous participants cannot be promoted - only authenticated users can.
 * @param participant The LiveKit participant to check
 * @returns true if the participant can be promoted, false otherwise
 */
export const getParticipantCanBePromoted = (participant: Participant): boolean => {
  // Check the 'authenticated' attribute set by the backend
  // This attribute is 'true' for authenticated users, 'false' for anonymous
  return participant.attributes?.authenticated === 'true'
}
