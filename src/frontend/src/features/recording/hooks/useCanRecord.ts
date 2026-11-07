import { type ApiConfig, useConfig } from '@/api/useConfig'
import { useUser } from '@/features/auth/api/useUser'
import { ApiAccessLevel, type ApiRoom } from '@/features/rooms/api/ApiRoom'
import { useIsAdminOrOwner } from '@/features/rooms/livekit/hooks/useIsAdminOrOwner'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'

// Room access levels on which authenticated participants can record.
const OPEN_ACCESS_LEVELS = [ApiAccessLevel.TRUSTED, ApiAccessLevel.PUBLIC]

export const isRecordingOpenToParticipants = (
  config?: ApiConfig,
  roomData?: ApiRoom
) =>
  config?.recording?.authenticated_participants_enabled === true &&
  !!roomData?.id &&
  !!roomData?.access_level &&
  OPEN_ACCESS_LEVELS.includes(roomData.access_level)

export const useIsRecordingOpenToParticipants = () => {
  const roomData = useRoomData()
  const { data: config } = useConfig()

  return isRecordingOpenToParticipants(config, roomData)
}

export const useCanRecord = () => {
  const isAdminOrOwner = useIsAdminOrOwner()
  const { isLoggedIn } = useUser()
  const isRecordingOpenToParticipants = useIsRecordingOpenToParticipants()

  return (
    isAdminOrOwner || (isLoggedIn === true && isRecordingOpenToParticipants)
  )
}
