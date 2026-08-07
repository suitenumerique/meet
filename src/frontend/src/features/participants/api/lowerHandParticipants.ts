import type { Participant } from 'livekit-client'
import { useLowerHandParticipant } from './lowerHandParticipant'
import { reportError } from '@/features/analytics/telemetry'

export const useLowerHandParticipants = () => {
  const { lowerHandParticipant } = useLowerHandParticipant()

  const lowerHandParticipants = (participants: Array<Participant>) => {
    try {
      const promises = participants.map((participant) =>
        lowerHandParticipant(participant)
      )
      return Promise.all(promises)
    } catch (error) {
      reportError('generic_failure', error, {
        context: 'An error occurred while lowering hands :',
      })
      throw new Error('An error occurred while lowering hands.', {
        cause: error,
      })
    }
  }
  return { lowerHandParticipants }
}
