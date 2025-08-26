import { Participant, Track } from 'livekit-client'
import { useParticipantPermissions } from './updateParticipantPermissions'
type Source = Track.Source

export const useUpdateParticipantsPermissions = () => {
  const { updateParticipantPermissions } = useParticipantPermissions()

  const updateParticipantsPermissions = (
    participants: Array<Participant>,
    sources: Array<Source>
  ) => {
    try {
      const promises = participants.map((participant) =>
        updateParticipantPermissions(participant, sources)
      )
      return Promise.all(promises)
    } catch (error) {
      console.error('An error occurred while updating permissions :', error)
      throw new Error('An error occurred while updating permissions.')
    }
  }
  return { updateParticipantsPermissions }
}
