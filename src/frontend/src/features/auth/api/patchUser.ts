import { useMutation, type UseMutationOptions } from '@tanstack/react-query'
import { fetchApi } from '@/api/fetchApi'
import type { ApiError } from '@/api/ApiError'
import { type ApiUser } from './ApiUser'

export type PatchUserParams = {
  userId: string
  user: Partial<
    Pick<
      ApiUser,
      | 'timezone'
      | 'language'
      | 'default_room_access_level'
      | 'default_room_configuration'
    >
  >
}

export const patchUser = ({ userId, user }: PatchUserParams) => {
  return fetchApi<ApiUser>(`/users/${userId}/`, {
    method: 'PATCH',
    body: JSON.stringify(user),
  })
}

export const patchUserMutationKey = ['patchUser']

export function usePatchUser(
  options?: UseMutationOptions<ApiUser, ApiError, PatchUserParams>
) {
  return useMutation<ApiUser, ApiError, PatchUserParams>({
    mutationKey: patchUserMutationKey,
    mutationFn: patchUser,
    ...options,
  })
}
