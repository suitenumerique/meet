import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRoomContext } from '@livekit/components-react'
import { RoomEvent } from 'livekit-client'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { isEncryptedRoom as checkEncryptedRoom, ApiEncryptionMode } from '@/features/rooms/api/ApiRoom'
import { useIsAdminOrOwner } from '@/features/rooms/livekit/hooks/useIsAdminOrOwner'
import { useEnterRoom } from '../api/enterRoom'
import {
  useListWaitingParticipants,
  WaitingParticipant,
} from '../api/listWaitingParticipants'
import { decodeNotificationDataReceived } from '@/features/notifications/utils'
import { NotificationType } from '@/features/notifications/NotificationType'
import { encryptKeyForParticipant, getSymmetricKey } from '@/features/encryption/lobbyKeyExchange'
import { useVaultClient } from '@/features/encryption'

export const POLL_INTERVAL_MS = 1000

export const useWaitingParticipants = () => {
  const [listEnabled, setListEnabled] = useState(true)

  const roomData = useRoomData()
  const roomId = roomData?.id || '' // FIXME - bad practice
  const encrypted = checkEncryptedRoom(roomData)
  const isAdvancedMode = roomData?.encryption_mode === ApiEncryptionMode.ADVANCED

  const room = useRoomContext()
  const isAdminOrOwner = useIsAdminOrOwner()
  const { client: vaultClient } = useVaultClient()

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

  const encryptKeyForAccept = async (participant: WaitingParticipant) => {
    let encryptedKey = ''
    let adminEphemeralPublicKey = ''
    let encryptedVaultKey = ''

    if (isAdvancedMode && vaultClient && participant.suite_user_id) {
      // Advanced mode: wrap the symmetric key for the joiner's vault public key
      try {
        const { publicKeys } = await vaultClient.fetchPublicKeys([participant.suite_user_id])
        const joinerPubKey = publicKeys[participant.suite_user_id]
        if (joinerPubKey) {
          // Get admin's encrypted symmetric key from the VaultE2EEManager
          // and re-wrap it for the joiner
          const adminPubKey = (await vaultClient.getPublicKey()).publicKey
          const { encryptedKeys } = await vaultClient.encryptWithoutKey(
            new Uint8Array(32).buffer,
            { [participant.suite_user_id]: joinerPubKey, self: adminPubKey }
          )
          const joinerKey = encryptedKeys[participant.suite_user_id]
          if (joinerKey) {
            // Encode as base64 for transport via REST API
            const bytes = new Uint8Array(joinerKey)
            encryptedVaultKey = btoa(String.fromCharCode(...bytes))
          }
        }
      } catch (err) {
        console.error('[VaultE2EE] Failed to wrap key for participant:', err)
      }
    } else if (encrypted && getSymmetricKey() && participant.ephemeral_public_key) {
      // Basic mode: DH key exchange
      const result = await encryptKeyForParticipant(
        participant.ephemeral_public_key
      )
      encryptedKey = result.encryptedKey
      adminEphemeralPublicKey = result.adminPublicKey
    }

    return { encryptedKey, adminEphemeralPublicKey, encryptedVaultKey }
  }

  const handleParticipantEntry = async (
    participant: WaitingParticipant,
    allowEntry: boolean
  ) => {
    let encryptedKey = ''
    let adminEphemeralPublicKey = ''
    let encryptedVaultKey = ''

    if (allowEntry) {
      const keys = await encryptKeyForAccept(participant)
      encryptedKey = keys.encryptedKey
      adminEphemeralPublicKey = keys.adminEphemeralPublicKey
      encryptedVaultKey = keys.encryptedVaultKey
    }

    await enterRoom({
      roomId: roomId,
      allowEntry,
      participantId: participant.id,
      encryptedKey,
      adminEphemeralPublicKey,
      encryptedVaultKey,
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
          let encryptedVaultKey = ''

          if (allowEntry) {
            const keys = await encryptKeyForAccept(participant)
            encryptedKey = keys.encryptedKey
            adminEphemeralPublicKey = keys.adminEphemeralPublicKey
            encryptedVaultKey = keys.encryptedVaultKey
          }

          return enterRoom({
            roomId: roomId,
            allowEntry,
            participantId: participant.id,
            encryptedKey,
            adminEphemeralPublicKey,
            encryptedVaultKey,
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
