import { useUser } from '@/features/auth/api/useUser'
import { ApiAccessLevel } from '@/features/rooms/api/ApiRoom'
import { useIsAdminOrOwner } from './useIsAdminOrOwner'
import { useRoomData } from './useRoomData'

export const useCanManageLobby = () => {
  const isAdminOrOwner = useIsAdminOrOwner()
  const { isLoggedIn } = useUser()
  const roomData = useRoomData()

  return (
    (isAdminOrOwner ||
      (isLoggedIn === true &&
        roomData?.access_level === ApiAccessLevel.TRUSTED)) &&
    roomData?.access_level !== ApiAccessLevel.PUBLIC
  )
}
