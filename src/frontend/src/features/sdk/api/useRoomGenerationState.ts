import { fetchApi } from '@/api/fetchApi'
import { useQuery } from '@tanstack/react-query'
import { keys } from '@/api/queryKeys'

export const fetchRoomGenerationState = async ({
  sessionId,
}: {
  sessionId: string
}) => {
  return fetchApi<any>(`/rooms/generation-state/`, {
    method: 'POST',
    body: JSON.stringify({
      sessionId: sessionId,
    }),
  })
}

export const useRoomGenerationState = ({
  sessionId,
}: {
  sessionId?: string
}) => {
  return useQuery({
    queryKey: [keys.roomGenerationState, sessionId],
    queryFn: () => fetchRoomGenerationState({ sessionId }),
    enabled: !!sessionId,
    refetchInterval: 1000,
  })
}
