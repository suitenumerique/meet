import { useMutation, UseMutationOptions } from '@tanstack/react-query'
import { fetchApi } from '@/api/fetchApi'
import { ApiError } from '@/api/ApiError'
import { ApiRoom } from './ApiRoom'

export interface CreateRoomParams {
  slug: string
  callbackId?: string
  username?: string
  isEncrypted?: boolean
}

const createRoom = ({
  slug,
  callbackId,
  username = '',
  isEncrypted = false,
}: CreateRoomParams): Promise<ApiRoom> => {
  const queryParams = username ? `?username=${encodeURIComponent(username)}` : ''
  return fetchApi(`rooms/${queryParams}`, {
    method: 'POST',
    body: JSON.stringify({
      name: slug,
      callback_id: callbackId,
      is_encrypted: isEncrypted,
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
