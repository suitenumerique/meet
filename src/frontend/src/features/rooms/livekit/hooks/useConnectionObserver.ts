import { useRoomContext } from '@livekit/components-react'
import { useEffect, useRef } from 'react'
import { DisconnectReason, RoomEvent } from 'livekit-client'
import { useIsAnalyticsEnabled } from '@/features/analytics/hooks/useIsAnalyticsEnabled'
import posthog from 'posthog-js'

export const useConnectionObserver = () => {
  const room = useRoomContext()
  const connectionStartTimeRef = useRef<number | null>(null)

  const isAnalyticsEnabled = useIsAnalyticsEnabled()

  useEffect(() => {
    if (!isAnalyticsEnabled) return

    const handleConnection = () => {
      // Preserve original connection timestamp across reconnections to measure
      // total session duration from first connect to final disconnect.
      if (connectionStartTimeRef.current != null) return
      connectionStartTimeRef.current = Date.now()
    }

    const handleReconnect = () => {
      posthog.capture('reconnect-event')
    }

    const handleDisconnect = (
      disconnectReason: DisconnectReason | undefined
    ) => {
      const connectionEndTime = Date.now()

      posthog.capture('disconnect-event', {
        // Calculate total session duration from first connection to final disconnect
        // This duration is sensitive to refreshing the page.
        sessionDuration: connectionStartTimeRef.current
          ? connectionEndTime - connectionStartTimeRef.current
          : -1,
        reason: disconnectReason
          ? DisconnectReason[disconnectReason]
          : 'UNKNOWN',
      })
    }

    room.on(RoomEvent.Connected, handleConnection)
    room.on(RoomEvent.Disconnected, handleDisconnect)
    room.on(RoomEvent.Reconnecting, handleReconnect)

    return () => {
      room.off(RoomEvent.Connected, handleConnection)
      room.off(RoomEvent.Disconnected, handleDisconnect)
      room.off(RoomEvent.Reconnecting, handleReconnect)
    }
  }, [room, isAnalyticsEnabled])

  useEffect(() => {
    return () => {
      connectionStartTimeRef.current = null
    }
  }, [])
}
