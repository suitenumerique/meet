import { Participant } from 'livekit-client'
import { useRoomData } from '../livekit/hooks/useRoomData'
import { fetchApi } from '@/api/fetchApi'

export const useDemoteParticipant = () => {
  const data = useRoomData()

  const demoteParticipant = async (participant: Participant) => {
    if (!data?.id) {
      throw new Error('Room id is not available')
    }

    return fetchApi(`rooms/${data.id}/demote-participant/`, {
      method: 'POST',
      body: JSON.stringify({
        participant_identity: participant.identity,
      }),
    })
  }
  return { demoteParticipant }
}
