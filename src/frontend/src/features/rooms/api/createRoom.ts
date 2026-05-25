import { useMutation, UseMutationOptions } from '@tanstack/react-query'
import { fetchApi } from '@/api/fetchApi'
import type { ApiError } from '@/api/ApiError'
import type { ApiRoom } from './ApiRoom'

export interface CreateRoomParams {
  slug: string
  callbackId?: string
  username?: string
}

const createRoom = ({
  slug,
  callbackId,
  username = '',
}: CreateRoomParams): Promise<ApiRoom> => {
  return fetchApi(`rooms/?username=${encodeURIComponent(username)}`, {
    method: 'POST',
    body: JSON.stringify({
      name: slug,
      callback_id: callbackId,
    }),
  })
}

export function useCreateRoom(
  options?: UseMutationOptions<ApiRoom, ApiError, CreateRoomParams>
) {
  return useMutation<ApiRoom, ApiError, CreateRoomParams>({
    mutationFn: createRoom,
    onSuccess: options?.onSuccess,
  })
}
