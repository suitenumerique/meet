import { fetchApi } from '@/api/fetchApi'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { AssignableParticipantRole } from '@/features/rooms/api/ApiRoom'
import { reportError } from '@/features/analytics/telemetry'

export const useParticipantRole = () => {
  const data = useRoomData()

  const updateParticipantRole = async (
    identity: string,
    role: AssignableParticipantRole
  ) => {
    if (!data?.id) {
      throw new Error('Room id is not available')
    }

    try {
      return fetchApi(`rooms/${data.id}/update-participant-role/`, {
        method: 'POST',
        body: JSON.stringify({
          participant_identity: identity,
          role: role,
        }),
      })
    } catch (error) {
      reportError(
        'generic_failure',
        new Error(
          `Failed to update participant's role ${identity}: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      )
    }
  }
  return { updateParticipantRole }
}
