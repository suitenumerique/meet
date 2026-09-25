import { fetchApi } from '@/api/fetchApi'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { getLiveKitAuthHeaders } from '../utils/getLiveKitAuthHeaders'

export const useRenameParticipant = () => {
  const data = useRoomData()

  const renameParticipant = async (name: string) => {
    if (!data?.id) {
      throw new Error('Room id is not available')
    }

    const token = data?.livekit?.token

    if (!token) {
      throw new Error('LiveKit token is not available')
    }

    const headers = getLiveKitAuthHeaders(token)
    return fetchApi(`rooms/${data.id}/rename/`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name,
      }),
    })
  }

  return { renameParticipant }
}
