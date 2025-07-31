import { ReactNode, useEffect, useState } from 'react'
import { useLocation, useParams } from 'wouter'
import { ErrorScreen } from '@/components/ErrorScreen'
import { useUser, UserAware } from '@/features/auth'
import { Conference } from '../components/Conference'
import { Join } from '../components/Join'
import { PermissionErrorModal } from '../components/PermissionErrorModal'
import { useKeyboardShortcuts } from '@/features/shortcuts/useKeyboardShortcuts'
import {
  isRoomValid,
  normalizeRoomId,
} from '@/features/rooms/utils/isRoomValid'
import { usePermissionsSync } from '@/features/rooms/hooks/usePermissions'

const BaseRoom = ({ children }: { children: ReactNode }) => (
  <UserAware>
    <PermissionErrorModal />
    {children}
  </UserAware>
)

export const Room = () => {
  const { isLoggedIn } = useUser()
  const [hasSubmittedEntry, setHasSubmittedEntry] = useState(false)

  const { roomId } = useParams()
  const [location, setLocation] = useLocation()
  const initialRoomData = history.state?.initialRoomData
  const mode = isLoggedIn && history.state?.create ? 'create' : 'join'
  const skipJoinScreen = isLoggedIn && mode === 'create'

  useKeyboardShortcuts()
  usePermissionsSync()

  const clearRouterState = () => {
    if (window?.history?.state) {
      window.history.replaceState({}, '')
    }
  }

  useEffect(() => {
    window.addEventListener('beforeunload', clearRouterState)
    return () => {
      window.removeEventListener('beforeunload', clearRouterState)
    }
  }, [])

  useEffect(() => {
    if (roomId && !isRoomValid(roomId)) {
      setLocation(normalizeRoomId(roomId))
    }
  }, [roomId, setLocation, location])

  if (!roomId) {
    return <ErrorScreen />
  }

  if (!hasSubmittedEntry && !skipJoinScreen) {
    return (
      <BaseRoom>
        <Join enterRoom={() => setHasSubmittedEntry(true)} roomId={roomId} />
      </BaseRoom>
    )
  }

  return (
    <BaseRoom>
      <Conference
        initialRoomData={initialRoomData}
        roomId={roomId}
        mode={mode}
      />
    </BaseRoom>
  )
}
