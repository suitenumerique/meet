import { ApiRoom } from '@/features/rooms/api/ApiRoom'
import { useParams } from 'wouter'
import { keys } from '@/api/queryKeys'
import { fetchRoom } from '@/features/rooms/api/fetchRoom'
import { useQuery } from '@tanstack/react-query'

export const useRoomData = (): ApiRoom | undefined => {
  const { roomId } = useParams()
  const { data } = useQuery({
    queryKey: [keys.room, roomId],
    queryFn: () => fetchRoom({ roomId: roomId! }),
    enabled: false,
  })
  return data
}
