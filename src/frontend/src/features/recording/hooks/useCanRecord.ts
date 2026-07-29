import { useIsAdminOrOwner } from '@/features/rooms/livekit/hooks/useIsAdminOrOwner'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { useUser } from '@/features/auth/api/useUser'

export const useCanRecord = () => {
  const apiRoomData = useRoomData()
  const isAdminOrOwner = useIsAdminOrOwner()
  const { isLoggedIn } = useUser()

  return (
    isAdminOrOwner ||
    (!!isLoggedIn &&
      apiRoomData?.configuration?.authenticated_can_record !== false)
  )
}
