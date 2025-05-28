import { useMutation, UseMutationOptions } from '@tanstack/react-query'
import { fetchApi } from '@/api/fetchApi'
import { ApiError } from '@/api/ApiError'

import { NewUserToken } from '../types'

export const createUserToken = async (): Promise<NewUserToken> => {
  return fetchApi('user-tokens/', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function useCreateUserToken(
  options?: UseMutationOptions<NewUserToken, ApiError>
) {
  return useMutation<NewUserToken, ApiError>({
    mutationFn: createUserToken,
    onSuccess: options?.onSuccess,
  })
}
