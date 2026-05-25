import type { ApiRoom } from '@/features/rooms/api/ApiRoom'
import { useParams } from 'wouter'
import { keys } from '@/api/queryKeys'
import { queryClient } from '@/api/queryClient'

export const useRoomData = (): ApiRoom | undefined => {
  const { roomId } = useParams()
  const queryKey = [keys.room, roomId]
  return queryClient.getQueryData<ApiRoom>(queryKey)
}
