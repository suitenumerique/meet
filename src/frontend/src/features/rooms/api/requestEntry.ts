import { fetchApi } from '@/api/fetchApi'
import { ApiLiveKit } from '@/features/rooms/api/ApiRoom'

export interface RequestEntryParams {
  roomId: string
  username?: string
}

export enum ApiLobbyStatus {
  IDLE = 'idle',
  WAITING = 'waiting',
  DENIED = 'denied',
  TIMEOUT = 'timeout',
  ACCEPTED = 'accepted',
}

export interface ApiRequestEntry {
  status: ApiLobbyStatus
  livekit?: ApiLiveKit
}

export const requestEntry = async ({
  roomId,
  username = '',
}: RequestEntryParams) => {
  return fetchApi<ApiRequestEntry>(`/rooms/${roomId}/request-entry/`, {
    method: 'POST',
    body: JSON.stringify({
      username,
    }),
  })
}
