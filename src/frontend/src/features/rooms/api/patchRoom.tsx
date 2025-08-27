import { type ApiRoom } from './ApiRoom'
import { fetchApi } from '@/api/fetchApi'
import { useMutation, UseMutationOptions } from '@tanstack/react-query'
import { ApiError } from '@/api/ApiError'

export type PatchRoomParams = {
  roomId: string
  room: Partial<Pick<ApiRoom, 'configuration' | 'access_level'>>
}

export const patchRoom = ({ roomId, room }: PatchRoomParams) => {
  return fetchApi<ApiRoom>(`/rooms/${roomId}/`, {
    method: 'PATCH',
    body: JSON.stringify(room),
  })
}

export function usePatchRoom(
  options?: UseMutationOptions<ApiRoom, ApiError, PatchRoomParams>
) {
  return useMutation<ApiRoom, ApiError, PatchRoomParams>({
    mutationFn: patchRoom,
    onSuccess: options?.onSuccess,
  })
}
