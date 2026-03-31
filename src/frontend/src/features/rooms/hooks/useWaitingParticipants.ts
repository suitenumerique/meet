import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRoomContext } from '@livekit/components-react'
import { RoomEvent } from 'livekit-client'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { useIsAdminOrOwner } from '@/features/rooms/livekit/hooks/useIsAdminOrOwner'
import { useEnterRoom } from '../api/enterRoom'
import {
  useListWaitingParticipants,
  WaitingParticipant,
} from '../api/listWaitingParticipants'
import { decodeNotificationDataReceived } from '@/features/notifications/utils'
import { NotificationType } from '@/features/notifications/NotificationType'
import { encryptKeyForParticipant, getSymmetricKey } from '@/features/encryption/lobbyKeyExchange'

export const POLL_INTERVAL_MS = 1000

export const useWaitingParticipants = () => {
  const [listEnabled, setListEnabled] = useState(true)

  const roomData = useRoomData()
  const roomId = roomData?.id || '' // FIXME - bad practice
  const isEncryptedRoom = roomData?.encryption_enabled ?? false

  const room = useRoomContext()
  const isAdminOrOwner = useIsAdminOrOwner()

  const handleDataReceived = useCallback((payload: Uint8Array) => {
    const notification = decodeNotificationDataReceived(payload)
    if (notification?.type === NotificationType.ParticipantWaiting) {
      setListEnabled(true)
    }
  }, [])

  useEffect(() => {
    if (isAdminOrOwner) {
      room.on(RoomEvent.DataReceived, handleDataReceived)
    }
    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived)
    }
  }, [isAdminOrOwner, room, handleDataReceived])

  const { data: waitingData, refetch: refetchWaiting } =
    useListWaitingParticipants(roomId, {
      retry: false,
      enabled: listEnabled && isAdminOrOwner,
      refetchInterval: POLL_INTERVAL_MS,
      refetchIntervalInBackground: true,
    })

  const waitingParticipants = useMemo(
    () => waitingData?.participants || [],
    [waitingData]
  )

  useEffect(() => {
    if (!waitingParticipants.length) setListEnabled(false)
  }, [waitingParticipants])

  const { mutateAsync: enterRoom } = useEnterRoom()

  const handleParticipantEntry = async (
    participant: WaitingParticipant,
    allowEntry: boolean
  ) => {
    let encryptedKey = ''
    let adminEphemeralPublicKey = ''

    if (allowEntry && isEncryptedRoom && getSymmetricKey() && participant.ephemeral_public_key) {
      const result = await encryptKeyForParticipant(
        participant.ephemeral_public_key
      )
      encryptedKey = result.encryptedKey
      adminEphemeralPublicKey = result.adminPublicKey
    }

    await enterRoom({
      roomId: roomId,
      allowEntry,
      participantId: participant.id,
      encryptedKey,
      adminEphemeralPublicKey,
    })
    await refetchWaiting()
  }

  const handleParticipantsEntry = async (
    allowEntry: boolean
  ): Promise<void> => {
    try {
      setListEnabled(false)

      await Promise.all(
        waitingParticipants.map(async (participant) => {
          let encryptedKey = ''
          let adminEphemeralPublicKey = ''

          if (allowEntry && isEncryptedRoom && getSymmetricKey() && participant.ephemeral_public_key) {
            const result = await encryptKeyForParticipant(
              participant.ephemeral_public_key
            )
            encryptedKey = result.encryptedKey
            adminEphemeralPublicKey = result.adminPublicKey
          }

          return enterRoom({
            roomId: roomId,
            allowEntry,
            participantId: participant.id,
            encryptedKey,
            adminEphemeralPublicKey,
          })
        })
      )

      await refetchWaiting()
    } catch (e) {
      console.error(e)
      setListEnabled(true)
    }
  }

  return {
    waitingParticipants,
    handleParticipantEntry,
    handleParticipantsEntry,
  }
}
