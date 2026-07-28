import { useRoomData } from '../livekit/hooks/useRoomData'
import { fetchApi } from '@/api/fetchApi'

export const useRemoveParticipant = () => {
  const data = useRoomData()

  const removeParticipant = async (identity: string) => {
    if (!data?.id) {
      throw new Error('Room id is not available')
    }

    return fetchApi(`rooms/${data.id}/remove-participant/`, {
      method: 'POST',
      body: JSON.stringify({
        participant_identity: identity,
      }),
    })
  }
  return { removeParticipant }
}
