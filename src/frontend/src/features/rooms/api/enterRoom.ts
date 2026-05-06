import { ApiError } from '@/api/ApiError'
import { fetchApi } from '@/api/fetchApi'
import { useMutation, UseMutationOptions } from '@tanstack/react-query'

export interface EnterRoomParams {
  roomId: string
  allowEntry: boolean
  participantId: string
  encryptedKey?: string
  adminEphemeralPublicKey?: string
  encryptedVaultKey?: string
}

export interface EnterRoomResponse {
  message?: string
}

export const enterRoom = async ({
  roomId,
  allowEntry,
  participantId,
  encryptedKey = '',
  adminEphemeralPublicKey = '',
  encryptedVaultKey = '',
}: EnterRoomParams): Promise<EnterRoomResponse> => {
  return await fetchApi<EnterRoomResponse>(`/rooms/${roomId}/enter/`, {
    method: 'POST',
    body: JSON.stringify({
      participant_id: participantId,
      allow_entry: allowEntry,
      encrypted_key: encryptedKey,
      admin_ephemeral_public_key: adminEphemeralPublicKey,
      encrypted_vault_key: encryptedVaultKey,
    }),
  })
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
