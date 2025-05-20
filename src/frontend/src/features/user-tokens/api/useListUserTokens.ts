import { useQuery, UseQueryOptions } from '@tanstack/react-query'
import { fetchApi } from '@/api/fetchApi'
import { ApiError } from '@/api/ApiError'
import { UserToken } from '../types'

export const listUserTokens = async (): Promise<UserToken[]> => {
  return fetchApi('user-tokens/')
}

export function useListUserTokens(
  options?: UseQueryOptions<UserToken[], ApiError>
) {
  return useQuery<UserToken[], ApiError>({
    queryKey: ['userTokens'],
    queryFn: listUserTokens,
    ...options,
  })
}
