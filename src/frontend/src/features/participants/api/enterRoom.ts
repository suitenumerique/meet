import { ApiError } from '@/api/ApiError'
import { fetchApi } from '@/api/fetchApi'
import { captureEvent } from '@/features/analytics/telemetry'
import { useMutation, type UseMutationOptions } from '@tanstack/react-query'

export interface EnterRoomParams {
  roomId: string
  allowEntry: boolean
  participantId: string
}

export interface EnterRoomResponse {
  message?: string
}

export const enterRoom = async ({
  roomId,
  allowEntry,
  participantId,
}: EnterRoomParams): Promise<EnterRoomResponse> => {
  try {
    return await fetchApi<EnterRoomResponse>(`/rooms/${roomId}/enter/`, {
      method: 'POST',
      body: JSON.stringify({
        participant_id: participantId,
        allow_entry: allowEntry,
      }),
    })
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 404) {
      captureEvent('lobby_entry_participant_gone', {
        room_id: roomId,
        allow_entry: allowEntry,
      })
      return { message: 'participant_gone' }
    }
    throw error
  }
}

export function useEnterRoom(
  options?: UseMutationOptions<EnterRoomResponse, ApiError, EnterRoomParams>
) {
  return useMutation<EnterRoomResponse, ApiError, EnterRoomParams>({
    mutationFn: enterRoom,
    onSuccess: options?.onSuccess,
    ...options,
  })
}
