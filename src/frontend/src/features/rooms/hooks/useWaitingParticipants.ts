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
import { toastQueue } from '@/features/notifications/components/ToastProvider'

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

    if (isAdvancedMode) {
      // Advanced mode: re-wrap the existing symmetric key for the joiner.
      // All steps are mandatory — if any fails, the participant must NOT be accepted
      // (they would join without a key and see nothing).
      if (!vaultClient) {
        throw new Error('Encryption service is not available')
      }
      if (!participant.suite_user_id) {
        throw new Error('Participant has no vault identity — they may not be authenticated')
      }

      const adminKeyBase64 = roomData?.encrypted_symmetric_key
      if (!adminKeyBase64) {
        throw new Error('Admin has no encrypted symmetric key for this room')
      }

      console.info('[VaultE2EE] Admin: wrapping key for joiner', participant.suite_user_id)
      const adminKeyBinary = atob(adminKeyBase64)
      const adminKeyBytes = new Uint8Array(adminKeyBinary.length)
      for (let i = 0; i < adminKeyBinary.length; i++) adminKeyBytes[i] = adminKeyBinary.charCodeAt(i)

      // Fetch joiner's vault public key
      const { publicKeys } = await vaultClient.fetchPublicKeys([participant.suite_user_id])
      const joinerPubKey = publicKeys[participant.suite_user_id]
      if (!joinerPubKey) {
        throw new Error(`Could not find encryption public key for participant "${participant.username}"`)
      }

      // Re-wrap the symmetric key for the joiner using shareKeys
      const { encryptedKeys } = await vaultClient.shareKeys(
        adminKeyBytes.buffer,
        { [participant.suite_user_id]: joinerPubKey }
      )
      const joinerKey = encryptedKeys[participant.suite_user_id]
      if (!joinerKey) {
        throw new Error('Key wrapping returned no result — shareKeys failed')
      }

      const bytes = new Uint8Array(joinerKey)
      encryptedVaultKey = btoa(String.fromCharCode(...bytes))
      console.info('[VaultE2EE] Admin: key wrapped successfully, length:', encryptedVaultKey.length)
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
      try {
        const keys = await encryptKeyForAccept(participant)
        encryptedKey = keys.encryptedKey
        adminEphemeralPublicKey = keys.adminEphemeralPublicKey
        encryptedVaultKey = keys.encryptedVaultKey
      } catch (err) {
        console.error('[VaultE2EE] Cannot accept participant:', err)
        toastQueue.add(
          {
            type: 'encryptionError' as NotificationType,
            message: `Cannot accept ${participant.username}: ${(err as Error).message}`,
          },
          { timeout: 8000 }
        )
        return
      }
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
            try {
              const keys = await encryptKeyForAccept(participant)
              encryptedKey = keys.encryptedKey
              adminEphemeralPublicKey = keys.adminEphemeralPublicKey
              encryptedVaultKey = keys.encryptedVaultKey
            } catch (err) {
              console.error('[VaultE2EE] Cannot accept participant:', err)
              toastQueue.add(
                {
                  type: 'encryptionError' as NotificationType,
                  message: `Cannot accept ${participant.username}: ${(err as Error).message}`,
                },
                { timeout: 8000 }
              )
              return
            }
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
