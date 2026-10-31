import { fetchApi } from '@/api/fetchApi'
import { getLiveKitAuthHeaders } from '../utils/getLiveKitAuthHeaders'

export const fetchRoomCapacity = ({
  roomId,
  token,
}: {
  roomId: string
  token: string
}) => {
  return fetchApi<{ is_full: boolean }>(`rooms/${roomId}/capacity/`, {
    headers: getLiveKitAuthHeaders(token),
  })
}
