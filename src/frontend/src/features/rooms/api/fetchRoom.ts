import { type ApiRoom } from './ApiRoom'
import { fetchApi } from '@/api/fetchApi'

export const fetchRoom = ({
  roomId,
  username = '',
}: {
  roomId: string
  username?: string
}) => {
  return fetchApi<ApiRoom>(
    `/rooms/${roomId}?username=${encodeURIComponent(username)}`
  )
}
