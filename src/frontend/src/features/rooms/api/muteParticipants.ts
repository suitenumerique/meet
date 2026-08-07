import type { Participant } from 'livekit-client'
import { useMuteParticipant } from './muteParticipant'
import { reportError } from '@/features/analytics/telemetry'

export const useMuteParticipants = () => {
  const { muteParticipant } = useMuteParticipant()

  const muteParticipants = (participants: Array<Participant>) => {
    try {
      const promises = participants.map((participant) =>
        muteParticipant(participant)
      )
      return Promise.all(promises)
    } catch (error) {
      reportError('participant_mute_api_failure', error, {
        context: 'An error occurred while muting participants :',
      })
      throw new Error('An error occurred while muting participants.', {
        cause: error,
      })
    }
  }
  return { muteParticipants }
}
