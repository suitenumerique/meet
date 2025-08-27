import { Participant } from 'livekit-client'
import { useMuteParticipant } from './muteParticipant'

export const useMuteParticipants = () => {
  const { muteParticipant } = useMuteParticipant()

  const muteParticipants = (participants: Array<Participant>) => {
    try {
      const promises = participants.map((participant) =>
        muteParticipant(participant)
      )
      return Promise.all(promises)
    } catch (error) {
      console.error('An error occurred while muting participants :', error)
      throw new Error('An error occurred while muting participants.')
    }
  }
  return { muteParticipants }
}
