import { type ApiRoom } from './ApiRoom'
import { fetchApi } from '@/api/fetchApi'

export const fetchRoom = ({ roomId }: { roomId: string }) => {
  return fetchApi<ApiRoom>(`/rooms/${roomId}/`)
}
