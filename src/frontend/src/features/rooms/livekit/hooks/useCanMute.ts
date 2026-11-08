import { useIsAdminOrOwner } from './useIsAdminOrOwner'
import type { Participant } from 'livekit-client'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { getEveryoneCanMute } from '@/features/rooms/utils/getEveryoneCanMute'

export const useCanMute = (participant: Participant) => {
  const apiRoomData = useRoomData()
  const isAdminOrOwner = useIsAdminOrOwner()
  return (
    participant.isLocal ||
    isAdminOrOwner ||
    getEveryoneCanMute(apiRoomData?.configuration?.everyone_can_mute)
  )
}
