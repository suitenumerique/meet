import type { ApiRoom } from '@/features/rooms/api/ApiRoom'
import { useParams } from 'wouter'
import { keys } from '@/api/queryKeys'
import { queryClient } from '@/api/queryClient'

export const getRoomData = (roomId?: string): ApiRoom | undefined =>
  queryClient.getQueryData<ApiRoom>([keys.room, roomId])

export const useRoomData = (): ApiRoom | undefined => {
  const { roomId } = useParams()
  return getRoomData(roomId)
}
