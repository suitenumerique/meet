import { useMutation, UseMutationOptions } from '@tanstack/react-query'
import { fetchApi } from '@/api/fetchApi'
import { ApiError } from '@/api/ApiError'
import { ApiRoom, ApiEncryptionMode } from './ApiRoom'

export interface CreateRoomParams {
  slug: string
  callbackId?: string
  username?: string
  encryptionMode?: ApiEncryptionMode
  encryptedSymmetricKey?: string
}

const createRoom = ({
  slug,
  callbackId,
  username = '',
  encryptionMode = ApiEncryptionMode.NONE,
  encryptedSymmetricKey = '',
}: CreateRoomParams): Promise<ApiRoom> => {
  const queryParams = username ? `?username=${encodeURIComponent(username)}` : ''
  return fetchApi(`rooms/${queryParams}`, {
    method: 'POST',
    body: JSON.stringify({
      name: slug,
      callback_id: callbackId,
      encryption_mode: encryptionMode,
      encrypted_symmetric_key: encryptedSymmetricKey,
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
