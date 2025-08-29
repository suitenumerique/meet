import { Participant } from 'livekit-client'
import { useLowerHandParticipant } from './lowerHandParticipant'

export const useLowerHandParticipants = () => {
  const { lowerHandParticipant } = useLowerHandParticipant()

  const lowerHandParticipants = (participants: Array<Participant>) => {
    try {
      const promises = participants.map((participant) =>
        lowerHandParticipant(participant)
      )
      return Promise.all(promises)
    } catch (error) {
      console.error('An error occurred while lowering hands :', error)
      throw new Error('An error occurred while lowering hands.')
    }
  }
  return { lowerHandParticipants }
}
