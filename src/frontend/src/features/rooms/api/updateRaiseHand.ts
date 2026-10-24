import { fetchApi } from '@/api/fetchApi'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { getLiveKitAuthHeaders } from '../utils/getLiveKitAuthHeaders'

export const useRaiseHand = () => {
  const data = useRoomData()

  const raiseHand = async (raised: boolean) => {
    if (!data?.id) {
      throw new Error('Room id is not available')
    }

    const token = data?.livekit?.token

    if (!token) {
      throw new Error('LiveKit token is not available')
    }

    const headers = getLiveKitAuthHeaders(token)
    return fetchApi(`rooms/${data.id}/toggle-hand/`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        raised,
      }),
    })
  }

  return { raiseHand }
}
