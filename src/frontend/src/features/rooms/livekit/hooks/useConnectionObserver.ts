import { useRoomContext } from '@livekit/components-react'
import { useEffect } from 'react'
import { DisconnectReason, RoomEvent } from 'livekit-client'
import { useIsAnalyticsEnabled } from '@/features/analytics/hooks/useIsAnalyticsEnabled'
import posthog from 'posthog-js'

export const useConnectionObserver = () => {
  const room = useRoomContext()

  const isAnalyticsEnabled = useIsAnalyticsEnabled()

  useEffect(() => {
    if (!isAnalyticsEnabled) return

    const handleReconnect = () => {
      posthog.capture('reconnect-event')
    }

    const handleDisconnect = (
      disconnectReason: DisconnectReason | undefined
    ) => {
      if (disconnectReason == DisconnectReason.CLIENT_INITIATED) return
      posthog.capture('disconnect-event', {
        reason: disconnectReason && DisconnectReason[disconnectReason],
      })
    }
    room.on(RoomEvent.Disconnected, handleDisconnect)
    room.on(RoomEvent.Reconnecting, handleReconnect)
    return () => {
      room.off(RoomEvent.Disconnected, handleDisconnect)
      room.off(RoomEvent.Reconnecting, handleReconnect)
    }
  }, [room, isAnalyticsEnabled])
}
