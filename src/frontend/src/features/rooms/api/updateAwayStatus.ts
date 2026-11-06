import { fetchApi } from '@/api/fetchApi'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { getLiveKitAuthHeaders } from '../utils/getLiveKitAuthHeaders'

export function useUpdateAwayStatus() {
  const data = useRoomData()
  const updateAwayStatus = async (away: boolean) => {
    const roomId = data?.id || data?.slug
    if (!roomId || !data?.livekit?.token)
      throw new Error('Room authentication unavailable')
    return fetchApi(`rooms/${encodeURIComponent(roomId)}/set-away-status/`, {
      method: 'POST',
      headers: getLiveKitAuthHeaders(data.livekit.token),
      body: JSON.stringify({ away }),
    })
  }
  return { updateAwayStatus }
}
