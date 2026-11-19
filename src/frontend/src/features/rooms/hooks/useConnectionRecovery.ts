import { useCallback, useEffect, useRef } from 'react'
import { type DisconnectReason, type Room, RoomEvent } from 'livekit-client'
import { reportError } from '@/features/analytics/telemetry'
import { useUser } from '@/features/auth/api/useUser'
import { navigateTo } from '@/navigation/navigateTo'
import { connectionRecoveryStore } from '@/stores/connectionRecovery'
import { userStore } from '@/stores/user'
import type { ApiLiveKit } from '../api/ApiRoom'
import { askForCredentials } from '../api/askForCredentials'
import { ConnectionRecovery } from '../livekit/utils/connectionRecovery'

export const useConnectionRecovery = ({
  room,
  roomId,
  isEnabled,
  initialCredentials,
  connect,
  onLobbyRequired,
}: {
  room: Room
  roomId: string
  isEnabled: boolean
  initialCredentials: ApiLiveKit | undefined
  connect: (credentials: ApiLiveKit, signal: AbortSignal) => Promise<void>
  onLobbyRequired: () => void
}) => {
  const { user } = useUser()
  const recoveryRef = useRef<ConnectionRecovery>()
  const latestRef = useRef({
    isEnabled,
    initialCredentials,
    connect,
    onLobbyRequired,
    fullName: user?.full_name,
  })
  latestRef.current = {
    isEnabled,
    initialCredentials,
    connect,
    onLobbyRequired,
    fullName: user?.full_name,
  }

  useEffect(() => {
    const latest = latestRef
    const recovery = new ConnectionRecovery({
      isEnabled: () => latest.current.isEnabled,
      initialCredentials: () => latest.current.initialCredentials,
      ask: (request, signal) =>
        askForCredentials(
          roomId,
          request,
          signal,
          userStore.username || latest.current.fullName
        ),
      connect: (credentials, signal) =>
        latest.current.connect(credentials, signal),
      disconnect: () => room.disconnect(),
      setRecovering: (isRecovering) => {
        connectionRecoveryStore.isRecovering = isRecovering
      },
      end: (reason) =>
        navigateTo('feedback', {}, { state: { reason, room_id: roomId } }),
      requireLobby: () => latest.current.onLobbyRequired(),
      reportUnexpected: (error) =>
        reportError('connection_recovery_failure', error),
    })
    recoveryRef.current = recovery

    // The SID is no longer available once the room is disconnected
    let liveSid: string | undefined
    const captureSid = () => {
      room.getSid().then(
        (sid) => {
          liveSid = sid || undefined
        },
        () => undefined
      )
    }
    const handleConnected = () => {
      captureSid()
      recovery.handleConnected()
    }
    const handleReconnecting = () => recovery.handleReconnecting()
    const handleReconnected = () => {
      captureSid()
      recovery.handleReconnected()
    }
    const handleDisconnected = (reason?: DisconnectReason) => {
      const sid = liveSid
      liveSid = undefined
      recovery.handleDisconnected(reason, sid)
    }
    room
      .on(RoomEvent.Connected, handleConnected)
      .on(RoomEvent.SignalReconnecting, handleReconnecting)
      .on(RoomEvent.Reconnecting, handleReconnecting)
      .on(RoomEvent.Reconnected, handleReconnected)
      .on(RoomEvent.Disconnected, handleDisconnected)

    return () => {
      room
        .off(RoomEvent.Connected, handleConnected)
        .off(RoomEvent.SignalReconnecting, handleReconnecting)
        .off(RoomEvent.Reconnecting, handleReconnecting)
        .off(RoomEvent.Reconnected, handleReconnected)
        .off(RoomEvent.Disconnected, handleDisconnected)
      recovery.dispose()
      if (recoveryRef.current === recovery) recoveryRef.current = undefined
      connectionRecoveryStore.isRecovering = false
    }
  }, [room, roomId])

  const leave = useCallback(() => recoveryRef.current?.leave(), [])

  return { leave }
}
