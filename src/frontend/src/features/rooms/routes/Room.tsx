import '@livekit/components-styles'
import { ReactNode, useEffect, useState } from 'react'
import { useLocation, useParams } from 'wouter'
import { ErrorScreen } from '@/components/ErrorScreen'
import { UserAware } from '@/features/auth/components/UserAware'
import { useUser } from '@/features/auth/api/useUser'
import { Conference } from '../components/Conference'
import { Join } from '../components/Join'
import { Permissions } from '../components/Permissions'
import { SilentMicDialog } from '../components/SilentMicDialog'
import { useKeyboardShortcuts } from '@/features/shortcuts/useKeyboardShortcuts'
import {
  isRoomValid,
  normalizeRoomId,
} from '@/features/rooms/utils/isRoomValid'
import { useConfig } from '@/api/useConfig.ts'
import { LogLevel, setLogLevel } from 'livekit-client'
import { useWatchDeviceAvailability } from '@/features/rooms/hooks/useWatchDeviceAvailability'
import { useWatchDeviceReleased } from '@/features/rooms/hooks/useWatchDeviceReleased'
import { useRoomPageTitle } from '@/features/rooms/livekit/hooks/useRoomPageTitle'

const BaseRoom = ({ children }: { children: ReactNode }) => {
  return (
    <UserAware>
      <Permissions />
      <SilentMicDialog />
      {children}
    </UserAware>
  )
}

const Room = () => {
  const { isLoggedIn } = useUser()
  const [hasSubmittedEntry, setHasSubmittedEntry] = useState(false)

  const { roomId } = useParams()
  const [location, setLocation] = useLocation()
  const initialRoomData = history.state?.initialRoomData
  // `mode` only drives the invite dialog, so it does not require a session:
  // an anonymous creator needs the share prompt just as much as a member.
  const mode = history.state?.create ? 'create' : 'join'
  // Skipping the join screen still does: anonymous participants have no display
  // name yet, and that screen is where they pick one.
  const skipJoinScreen = isLoggedIn && mode === 'create'

  const { data } = useConfig()

  useRoomPageTitle(roomId)

  useEffect(() => {
    const shouldSilenceLogs = data?.silence_livekit_debug_logs || false
    setLogLevel(shouldSilenceLogs ? LogLevel.silent : LogLevel.debug)
  }, [data?.silence_livekit_debug_logs])

  useKeyboardShortcuts()
  useWatchDeviceAvailability()
  useWatchDeviceReleased()

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

export default Room
