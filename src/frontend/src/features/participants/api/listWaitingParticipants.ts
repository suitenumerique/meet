import { fetchApi } from '@/api/fetchApi'
import { useQuery, type UseQueryOptions } from '@tanstack/react-query'
import type { ApiError } from '@/api/ApiError'
import { keys } from '@/api/queryKeys'

export type WaitingParticipant = {
  id: string
  status: string
  username: string
  color: string
}

export type WaitingParticipantsResponse = {
  participants: WaitingParticipant[]
}

export type WaitingParticipantsParams = {
  roomId: string
}

export const listWaitingParticipants = async ({
  roomId,
}: WaitingParticipantsParams): Promise<WaitingParticipantsResponse> => {
  return fetchApi<WaitingParticipantsResponse>(
    `/rooms/${roomId}/waiting-participants/`,
    {
      method: 'GET',
    }
  )
}

export const useListWaitingParticipants = (
  roomId: string,
  queryOptions?: Omit<
    UseQueryOptions<
      WaitingParticipantsResponse,
      ApiError,
      WaitingParticipantsResponse
    >,
    'queryKey'
  >
) => {
  return useQuery<
    WaitingParticipantsResponse,
    ApiError,
    WaitingParticipantsResponse
  >({
    queryKey: [keys.waitingParticipants, roomId],
    queryFn: () => listWaitingParticipants({ roomId }),
    ...queryOptions,
  })
}
