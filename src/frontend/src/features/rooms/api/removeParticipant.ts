import { Participant } from 'livekit-client'
import { useRoomData } from '../livekit/hooks/useRoomData'
import { fetchApi } from '@/api/fetchApi'

export const useRemoveParticipant = () => {
  const data = useRoomData()

  const removeParticipant = async (participant: Participant) => {
    if (!data?.id) {
      throw new Error('Room id is not available')
    }

    return await fetchApi(`rooms/${data.id}/remove/${participant.identity}/`, {
      method: 'POST',
    })
  }
  return { removeParticipant }
}
