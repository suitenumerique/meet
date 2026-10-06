import {
  useConnectionState,
  useRemoteParticipants,
} from '@livekit/components-react'
import { ConnectionState, ParticipantKind } from 'livekit-client'
import { useEffect, useRef } from 'react'
import { useConfig } from '@/api/useConfig'
import { useIsAdminOrOwner } from '@/features/rooms/livekit/hooks/useIsAdminOrOwner'
import { notifyRoomFull } from '@/features/notifications/utils'

/**
 * Warns a host each time the meeting fills up. Counts people the way the media
 * server does, leaving out agents and recorders, since room.numParticipants
 * trails a join by seconds.
 */
export const WarnHostWhenRoomFull = () => {
  const { data } = useConfig()
  const isAdminOrOwner = useIsAdminOrOwner()
  const remoteParticipants = useRemoteParticipants({ updateOnlyOn: [] })
  const connectionState = useConnectionState()
  const wasFullRef = useRef(false)
  const limit = data?.room_max_participants

  useEffect(() => {
    if (!limit || !isAdminOrOwner) return
    // A full reconnect drops and re-adds everyone; skipping it keeps the
    // toast from repeating when nobody left.
    if (connectionState !== ConnectionState.Connected) return
    const count =
      remoteParticipants.filter(
        (p) =>
          p.kind !== ParticipantKind.AGENT && p.kind !== ParticipantKind.EGRESS
      ).length + 1
    const isFull = count >= limit
    if (isFull && !wasFullRef.current) notifyRoomFull()
    wasFullRef.current = isFull
  }, [remoteParticipants, limit, isAdminOrOwner, connectionState])

  return null
}
