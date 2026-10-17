import { useMutation, type UseMutationOptions } from '@tanstack/react-query'
import { fetchApi } from '@/api/fetchApi'
import type { ApiError } from '@/api/ApiError'
import { type ApiUser } from './ApiUser'
import { keys } from '@/api/queryKeys'
import { queryClient } from '@/api/queryClient'
import { reportError } from '@/features/analytics/telemetry'

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

// No mutation key on purpose: RoomsTab counts patchUserMutationKey in flight
// to decide when to refetch, and these saves must not hold that back.
export function usePatchUserPreferences() {
  return useMutation<ApiUser, ApiError, PatchUserParams>({
    mutationFn: patchUser,
    onMutate: ({ user: partialUser }) => {
      queryClient.setQueryData<ApiUser | false>([keys.user], (previous) =>
        previous ? { ...previous, ...partialUser } : previous
      )
    },
    onError: (error) => {
      if (error.statusCode === 401) return
      reportError('generic_failure', error, {
        context: '[usePatchUserPreferences] Failed to save preferences:',
      })
    },
  })
}

export function usePatchUser(
  options?: UseMutationOptions<ApiUser, ApiError, PatchUserParams>
) {
  return useMutation<ApiUser, ApiError, PatchUserParams>({
    mutationKey: patchUserMutationKey,
    mutationFn: patchUser,
    ...options,
  })
}
