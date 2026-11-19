import { fetchApi } from '@/api/fetchApi'
import type { ApiLiveKit } from '@/features/rooms/api/ApiRoom'
import { getLobbyParticipantId } from '@/stores/lobby'
import {
  type LiveKitRoomRequest,
  toLiveKitRoomBody,
} from './liveKitRoomRequest'

export interface RequestEntryParams {
  roomId: string
  username?: string
  request?: LiveKitRoomRequest
  signal?: AbortSignal
}

export enum ApiLobbyStatus {
  IDLE = 'idle',
  WAITING = 'waiting',
  DENIED = 'denied',
  TIMEOUT = 'timeout',
  ACCEPTED = 'accepted',
  // Client-side only: the room was deleted while waiting
  DELETED = 'deleted',
}

export interface ApiRequestEntry {
  id?: string
  status: ApiLobbyStatus
  livekit?: ApiLiveKit | null
}

export const requestEntry = async ({
  roomId,
  username = '',
  request,
  signal,
}: RequestEntryParams) => {
  const participantId = getLobbyParticipantId(roomId)
  return fetchApi<ApiRequestEntry>(`/rooms/${roomId}/request-entry/`, {
    method: 'POST',
    body: JSON.stringify({
      username,
      ...(participantId && { participant_id: participantId }),
      ...(request && toLiveKitRoomBody(request)),
    }),
    signal,
  })
}
