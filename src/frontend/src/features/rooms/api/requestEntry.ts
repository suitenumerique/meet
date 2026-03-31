import { fetchApi } from '@/api/fetchApi'
import { ApiLiveKit } from '@/features/rooms/api/ApiRoom'

export interface RequestEntryParams {
  roomId: string
  username?: string
  ephemeralPublicKey?: string
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
  encrypted_key?: string
  admin_ephemeral_public_key?: string
}

export const requestEntry = async ({
  roomId,
  username = '',
  ephemeralPublicKey = '',
}: RequestEntryParams) => {
  return fetchApi<ApiRequestEntry>(`/rooms/${roomId}/request-entry/`, {
    method: 'POST',
    body: JSON.stringify({
      username,
      ephemeral_public_key: ephemeralPublicKey,
    }),
  })
}
