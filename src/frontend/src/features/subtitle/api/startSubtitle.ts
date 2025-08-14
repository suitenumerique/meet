import { useMutation, UseMutationOptions } from '@tanstack/react-query'
import { fetchApi } from '@/api/fetchApi'
import { ApiError } from '@/api/ApiError'
import { ApiRoom } from '@/features/rooms/api/ApiRoom'

export interface StartSubtitleParams {
  id: string
  token: string
}

const startSubtitle = ({
  id,
  token,
}: StartSubtitleParams): Promise<ApiRoom> => {
  return fetchApi(`rooms/${id}/start-subtitle/`, {
    method: 'POST',
    body: JSON.stringify({
      token,
    }),
  })
}

export function useStartSubtitle(
  options?: UseMutationOptions<ApiRoom, ApiError, StartSubtitleParams>
) {
  return useMutation<ApiRoom, ApiError, StartSubtitleParams>({
    mutationFn: startSubtitle,
    ...options,
  })
}
