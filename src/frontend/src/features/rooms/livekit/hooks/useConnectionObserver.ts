import {
  useRemoteParticipants,
  useRoomContext,
} from '@livekit/components-react'
import { useEffect, useRef } from 'react'
import { DisconnectReason, RoomEvent } from 'livekit-client'
import { useIsAnalyticsEnabled } from '@/features/analytics/hooks/useIsAnalyticsEnabled'
import posthog from 'posthog-js'
import { connectionObserverStore } from '@/stores/connectionObserver'
import { useConfig } from '@/api/useConfig'

export const useConnectionObserver = () => {
  const room = useRoomContext()
  const connectionStartTimeRef = useRef<number | null>(null)

  const { data } = useConfig()
  const isAnalyticsEnabled = useIsAnalyticsEnabled()

  const idleDisconnectModalTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null)

  const remoteParticipants = useRemoteParticipants({
    updateOnlyOn: [
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
    ],
  })

  useEffect(() => {
    // Always clear existing timer on dependency change
    if (idleDisconnectModalTimeoutRef.current) {
      clearTimeout(idleDisconnectModalTimeoutRef.current)
      idleDisconnectModalTimeoutRef.current = null
    }

    const delay = data?.idle_disconnect_warning_delay

    // Disabled or invalid delay: ensure modal is closed
    if (!delay) {
      connectionObserverStore.isIdleDisconnectModalOpen = false
      return
    }

    if (remoteParticipants.length === 0) {
      idleDisconnectModalTimeoutRef.current = setTimeout(() => {
        connectionObserverStore.isIdleDisconnectModalOpen = true
      }, delay)
    } else {
      connectionObserverStore.isIdleDisconnectModalOpen = false
    }

    return () => {
      if (idleDisconnectModalTimeoutRef.current) {
        clearTimeout(idleDisconnectModalTimeoutRef.current)
        idleDisconnectModalTimeoutRef.current = null
      }
    }
  }, [remoteParticipants.length, data?.idle_disconnect_warning_delay])

  useEffect(() => {
    if (!isAnalyticsEnabled) return

    const handleConnection = () => {
      // Preserve original connection timestamp across reconnections to measure
      // total session duration from first connect to final disconnect.
      if (connectionStartTimeRef.current != null) return
      connectionStartTimeRef.current = Date.now()
      posthog.capture('connection-event')
    }

    const handleReconnect = () => {
      posthog.capture('reconnect-event')
    }

    const handleReconnected = () => {
      posthog.capture('reconnected-event')
    }

    const handleSignalingConnect = () => {
      posthog.capture('signaling-connect-event')
    }

    const handleSignalingReconnect = () => {
      posthog.capture('signaling-reconnect-event')
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
    room.on(RoomEvent.SignalConnected, handleSignalingConnect)
    room.on(RoomEvent.Disconnected, handleDisconnect)
    room.on(RoomEvent.Reconnecting, handleReconnect)
    room.on(RoomEvent.Reconnected, handleReconnected)
    room.on(RoomEvent.SignalReconnecting, handleSignalingReconnect)

    return () => {
      room.off(RoomEvent.Connected, handleConnection)
      room.off(RoomEvent.SignalConnected, handleSignalingConnect)
      room.off(RoomEvent.Disconnected, handleDisconnect)
      room.off(RoomEvent.Reconnecting, handleReconnect)
      room.off(RoomEvent.Reconnected, handleReconnected)
      room.off(RoomEvent.SignalReconnecting, handleSignalingReconnect)
    }
  }, [room, isAnalyticsEnabled])

  useEffect(() => {
    return () => {
      connectionStartTimeRef.current = null
    }
  }, [])
}
