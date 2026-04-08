import { useIsAdminOrOwner } from './useIsAdminOrOwner'
import { Participant } from 'livekit-client'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'

export const useCanMute = (participant: Participant) => {
  const apiRoomData = useRoomData()
  const isAdminOrOwner = useIsAdminOrOwner()
  return (
    participant.isLocal ||
    isAdminOrOwner ||
    (!isAdminOrOwner && apiRoomData?.configuration?.everyone_can_mute !== false)
  )
}
