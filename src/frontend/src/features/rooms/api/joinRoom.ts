import { type ApiRoom } from './ApiRoom'
import { fetchApi } from '@/api/fetchApi'
import {
  type LiveKitRoomRequest,
  toLiveKitRoomBody,
} from './liveKitRoomRequest'

export type JoinRoomParams = {
  roomId: string
  username?: string
  request?: LiveKitRoomRequest
  signal?: AbortSignal
}

export const joinRoom = ({
  roomId,
  username,
  request,
  signal,
}: JoinRoomParams) => {
  return fetchApi<ApiRoom>(`/rooms/${roomId}/join/`, {
    method: 'POST',
    body: JSON.stringify({
      username,
      ...(request && toLiveKitRoomBody(request)),
    }),
    signal,
  })
}
