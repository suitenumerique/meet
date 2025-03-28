import { fetchApi } from '@/api/fetchApi'
import { useQuery } from '@tanstack/react-query'
import { keys } from '@/api/queryKeys'
import { CallbackCreationRoomData } from '../utils/types'

export type CallbackResponse = {
  status: string
  room: CallbackCreationRoomData
}

export const fetchRoomGenerationState = async ({
  callbackId,
}: {
  callbackId: string
}) => {
  return fetchApi<CallbackResponse>(`/rooms/creation-callback/`, {
    method: 'POST',
    body: JSON.stringify({
      callback_id: callbackId,
    }),
  })
}

export const useRoomCreationCallback = ({
  callbackId = '',
}: {
  callbackId?: string
}) => {
  return useQuery({
    queryKey: [keys.roomCreationCallback, callbackId],
    queryFn: () => fetchRoomGenerationState({ callbackId }),
    enabled: !!callbackId,
    refetchInterval: 1000,
  })
}
