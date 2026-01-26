import { Participant } from 'livekit-client'
import { useRoomData } from '../livekit/hooks/useRoomData'
import { fetchApi } from '@/api/fetchApi'

export const usePromoteParticipant = () => {
  const data = useRoomData()

  const promoteParticipant = async (participant: Participant) => {
    if (!data?.id) {
      throw new Error('Room id is not available')
    }

    return fetchApi(`rooms/${data.id}/promote-participant/`, {
      method: 'POST',
      body: JSON.stringify({
        participant_identity: participant.identity,
      }),
    })
  }
  return { promoteParticipant }
}
