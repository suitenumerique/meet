import { type ApiRoom } from './ApiRoom'
import { fetchApi } from '@/api/fetchApi'

export type JoinRoomParams = {
  roomId: string
  username?: string
}

export const joinRoom = ({ roomId, username }: JoinRoomParams) => {
  return fetchApi<ApiRoom>(`/rooms/${roomId}/join/`, {
    method: 'POST',
    body: JSON.stringify({ username }),
  })
}
