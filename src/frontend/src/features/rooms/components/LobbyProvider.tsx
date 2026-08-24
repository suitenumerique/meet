import { useCallback, useEffect } from 'react'
import { useConnectionState, useRoomContext } from '@livekit/components-react'
import { ConnectionState, RoomEvent } from 'livekit-client'
import { useCanManageLobby } from '@/features/rooms/livekit/hooks/useCanManageLobby'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { useListWaitingParticipants } from '@/features/participants/api/listWaitingParticipants'
import { useSidePanel } from '@/features/rooms/livekit/hooks/useSidePanel'
import { decodeNotificationDataReceived } from '@/features/notifications/utils'
import { NotificationType } from '@/features/notifications'
import { usePrevious } from '@/hooks/usePrevious'
import { keys } from '@/api/queryKeys'
import { queryClient } from '@/api/queryClient'
import { ApiError } from '@/api/ApiError'

export const POLL_INTERVAL_MS = 1000
export const LAZY_POLL_INTERVAL_MS = 10_000

export const LobbyProvider = () => {
  const room = useRoomContext()

  const canManageLobby = useCanManageLobby()
  const roomData = useRoomData()
  const { isParticipantsOpen } = useSidePanel()
  const isConnected = useConnectionState(room) === ConnectionState.Connected

  const roomId = roomData?.id || '' // FIXME - bad practice

  const { error: waitingError, refetch: refetchWaiting } =
    useListWaitingParticipants(roomId, {
      retry: false,
      enabled: canManageLobby && isConnected && !!roomId,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchInterval: (query) => {
        if (!query.state.data?.participants?.length) return false
        if (isParticipantsOpen) return POLL_INTERVAL_MS
        return LAZY_POLL_INTERVAL_MS
      },
      refetchIntervalInBackground: true,
    })

  // Triggers: each one-shot, idempotent, deduped by React Query if
  // concurrent. The interval takes over whenever a fetch finds waiters.
  const fetchIfManager = useCallback(() => {
    if (canManageLobby) refetchWaiting()
  }, [canManageLobby, refetchWaiting])

  // 1. Connection established (join or reconnect)
  useEffect(() => {
    room.on(RoomEvent.Connected, fetchIfManager)
    room.on(RoomEvent.Reconnected, fetchIfManager)
    return () => {
      room.off(RoomEvent.Connected, fetchIfManager)
      room.off(RoomEvent.Reconnected, fetchIfManager)
    }
  }, [room, fetchIfManager])

  // 2. Someone started waiting (LiveKit broadcast).
  const handleDataReceived = useCallback(
    (payload: Uint8Array) => {
      const notification = decodeNotificationDataReceived(payload)
      if (notification?.type === NotificationType.ParticipantWaiting) {
        fetchIfManager()
      }
    },
    [fetchIfManager]
  )

  useEffect(() => {
    if (canManageLobby) {
      room.on(RoomEvent.DataReceived, handleDataReceived)
    }
    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived)
    }
  }, [canManageLobby, room, handleDataReceived])

  // 3. Rights regained.
  const prevCanManageLobby = usePrevious(canManageLobby)
  useEffect(() => {
    if (!prevCanManageLobby && canManageLobby && isConnected) {
      fetchIfManager()
    }
  }, [
    prevCanManageLobby,
    canManageLobby,
    isParticipantsOpen,
    fetchIfManager,
    isConnected,
  ])

  const clearWaitingList = useCallback(() => {
    const queryKey = [keys.waitingParticipants, roomId]
    queryClient.cancelQueries({ queryKey })
    queryClient.setQueryData(queryKey, { participants: [] })
  }, [roomId])

  // Rights lost mid-meeting (covers trusted -> restricted/public).
  useEffect(() => {
    if (prevCanManageLobby && !canManageLobby) clearWaitingList()
  }, [prevCanManageLobby, canManageLobby, clearWaitingList])

  useEffect(() => {
    if (
      waitingError instanceof ApiError &&
      [401, 403].includes(waitingError.statusCode)
    ) {
      clearWaitingList()
    }
  }, [waitingError, clearWaitingList])

  return null
}
