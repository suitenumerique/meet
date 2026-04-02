import { useMutation, UseMutationOptions } from '@tanstack/react-query'
import { fetchApi } from '@/api/fetchApi'
import { ApiError } from '@/api/ApiError'
import { ApiRoom, ApiEncryptionMode } from './ApiRoom'

export interface CreateRoomParams {
  slug: string
  callbackId?: string
  username?: string
  encryptionMode?: ApiEncryptionMode
}

const createRoom = ({
  slug,
  callbackId,
  username = '',
  encryptionMode = ApiEncryptionMode.NONE,
}: CreateRoomParams): Promise<ApiRoom> => {
  return fetchApi(`rooms/?username=${encodeURIComponent(username)}`, {
    method: 'POST',
    body: JSON.stringify({
      name: slug,
      callback_id: callbackId,
      encryption_mode: encryptionMode,
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
