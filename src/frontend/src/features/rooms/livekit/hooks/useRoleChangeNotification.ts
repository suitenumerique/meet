import { useCallback, useEffect } from 'react'
import { useRoomContext } from '@livekit/components-react'
import { RoomEvent } from 'livekit-client'
import { useParams } from 'wouter'
import { keys } from '@/api/queryKeys'
import { queryClient } from '@/api/queryClient'
import { decodeNotificationDataReceived } from '@/features/notifications/utils'
import { NotificationType } from '@/features/notifications/NotificationType'

/**
 * Hook that listens for role change notifications and refetches room data.
 * This ensures participants see updated permissions when they are promoted/demoted.
 */
export const useRoleChangeNotification = () => {
  const room = useRoomContext()
  const { roomId } = useParams()

  const handleDataReceived = useCallback(
    (payload: Uint8Array) => {
      const notification = decodeNotificationDataReceived(payload)
      if (notification?.type === NotificationType.RoleChanged) {
        // Invalidate the room query to trigger a refetch
        queryClient.invalidateQueries({ queryKey: [keys.room, roomId] })
      }
    },
    [roomId]
  )

  useEffect(() => {
    room.on(RoomEvent.DataReceived, handleDataReceived)
    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived)
    }
  }, [room, handleDataReceived])
}
