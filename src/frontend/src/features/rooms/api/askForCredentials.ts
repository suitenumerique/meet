import { keys } from '@/api/queryKeys'
import { queryClient } from '@/api/queryClient'
import { getLobbyParticipantId, setLobbyParticipantId } from '@/stores/lobby'
import { userStore } from '@/stores/user'
import type { AskAnswer } from '../livekit/utils/connectionRecovery'
import type { ApiRoom } from './ApiRoom'
import { joinRoom } from './joinRoom'
import type { LiveKitRoomRequest } from './liveKitRoomRequest'
import { ApiLobbyStatus, requestEntry } from './requestEntry'

// Participants the lobby let in ask it again: it knows them by their id
export const askForCredentials = async (
  roomId: string,
  request: LiveKitRoomRequest,
  signal: AbortSignal,
  displayName: string | undefined
): Promise<AskAnswer> => {
  if (getLobbyParticipantId(roomId)) {
    const entry = await requestEntry({
      roomId,
      username: displayName || 'anonymous',
      request,
      signal,
    })
    if (entry.id) setLobbyParticipantId(roomId, entry.id)
    if (entry.status === ApiLobbyStatus.DENIED) return 'denied'
    const livekit = entry.livekit
    if (entry.status !== ApiLobbyStatus.ACCEPTED || !livekit) return 'lobby'
    if (!signal.aborted) {
      queryClient.setQueryData<ApiRoom>(
        [keys.room, roomId],
        (cached) => cached && { ...cached, livekit }
      )
    }
    return livekit
  }

  const room = await joinRoom({
    roomId,
    username: userStore.username,
    request,
    signal,
  })
  if (!room.livekit) return 'lobby'
  if (!signal.aborted) {
    queryClient.setQueryData<ApiRoom>([keys.room, roomId], room)
  }
  return room.livekit
}
