import { useMutation, UseMutationOptions } from '@tanstack/react-query'
import { fetchApi } from '@/api/fetchApi'
import { ApiError } from '@/api/ApiError'

export type DeleteUserTokenParams = {
  digest: string
}

export const deleteUserToken = async ({
  digest,
}: DeleteUserTokenParams): Promise<void> => {
  return fetchApi(`user-tokens/${digest}/`, {
    method: 'DELETE',
  })
}

export function useDeleteUserToken(
  options?: UseMutationOptions<void, ApiError, DeleteUserTokenParams>
) {
  return useMutation<void, ApiError, DeleteUserTokenParams>({
    mutationFn: deleteUserToken,
    onSuccess: options?.onSuccess,
  })
}
