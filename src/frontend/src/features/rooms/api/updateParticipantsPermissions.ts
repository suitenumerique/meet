import type { Participant, Track } from 'livekit-client'
import { useParticipantPermissions } from './updateParticipantPermissions'
import { reportError } from '@/features/analytics/telemetry'
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
      reportError('permissions_api_failure', error, {
        context: 'An error occurred while updating permissions :',
      })
      throw new Error('An error occurred while updating permissions.', {
        cause: error,
      })
    }
  }
  return { updateParticipantsPermissions }
}
