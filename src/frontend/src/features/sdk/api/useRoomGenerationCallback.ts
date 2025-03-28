import { fetchApi } from '@/api/fetchApi'
import { useQuery } from '@tanstack/react-query'
import { keys } from '@/api/queryKeys'

export const fetchRoomGenerationState = async ({
  callbackId,
}: {
  callbackId: string
}) => {
  return fetchApi<any>(`/rooms/generation-callback/`, {
    method: 'POST',
    body: JSON.stringify({
      callbackId: callbackId,
    }),
  })
}

export const useRoomGenerationCallback = ({
  callbackId,
}: {
  callbackId?: string
}) => {
  return useQuery({
    queryKey: [keys.roomGenerationCallback, callbackId],
    queryFn: () => fetchRoomGenerationState({ callbackId }),
    enabled: !!callbackId,
    refetchInterval: 1000,
  })
}
