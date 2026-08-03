import { fetchApi } from '@/api/fetchApi'
import type { ApiLiveKit } from '@/features/rooms/api/ApiRoom'
import { getLobbyParticipantId } from '@/stores/lobby'

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
  id?: string
  status: ApiLobbyStatus
  livekit?: ApiLiveKit
}

export const requestEntry = async ({
  roomId,
  username = '',
}: RequestEntryParams) => {
  const participantId = getLobbyParticipantId(roomId)
  return fetchApi<ApiRequestEntry>(`/rooms/${roomId}/request-entry/`, {
    method: 'POST',
    body: JSON.stringify({
      username,
      ...(participantId && { participant_id: participantId }),
    }),
  })
}
