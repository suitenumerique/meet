import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { keys } from '@/api/queryKeys'
import {
  requestEntry,
  ApiLobbyStatus,
  ApiRequestEntry,
} from '../api/requestEntry'
import {
  generateEphemeralKeyPair,
  encodePublicKey,
  decryptKeyFromAdmin,
  setSymmetricKey,
  setEncryptedVaultKey,
  saveEphemeralKeyPair,
  loadEphemeralKeyPair,
} from '@/features/encryption/lobbyKeyExchange'

export const WAIT_TIMEOUT_MS = 600000 // 10 minutes
export const POLL_INTERVAL_MS = 1000

export const useLobby = ({
  roomId,
  username,
  onAccepted,
  encryptionEnabled = false,
}: {
  roomId: string
  username: string
  onAccepted: (e: ApiRequestEntry) => void
  encryptionEnabled?: boolean
}) => {
  const [status, setStatus] = useState(ApiLobbyStatus.IDLE)
  const waitingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const ephemeralKeyRef = useRef<{ publicKey: Uint8Array; secretKey: Uint8Array } | null>(null)
  const ephemeralPublicKeyB64Ref = useRef<string>('')

  const clearWaitingTimeout = useCallback(() => {
    if (waitingTimeoutRef.current) {
      clearTimeout(waitingTimeoutRef.current)
      waitingTimeoutRef.current = null
    }
  }, [])

  const startWaitingTimeout = useCallback(() => {
    clearWaitingTimeout()
    waitingTimeoutRef.current = setTimeout(() => {
      setStatus(ApiLobbyStatus.TIMEOUT)
    }, WAIT_TIMEOUT_MS)
  }, [clearWaitingTimeout])

  const { data: waitingData } = useQuery({
    /* eslint-disable @tanstack/query/exhaustive-deps */
    queryKey: [keys.requestEntry, roomId],
    queryFn: async () => {
      const response = await requestEntry({
        roomId,
        username,
        ephemeralPublicKey: ephemeralPublicKeyB64Ref.current,
      })
      if (response.status === ApiLobbyStatus.ACCEPTED) {
        clearWaitingTimeout()
        setStatus(ApiLobbyStatus.ACCEPTED)

        // Basic mode: DH key exchange
        if (
          encryptionEnabled &&
          response.encrypted_key &&
          response.admin_ephemeral_public_key &&
          ephemeralKeyRef.current
        ) {
          const decryptedKey = await decryptKeyFromAdmin(
            ephemeralKeyRef.current.secretKey,
            response.admin_ephemeral_public_key,
            response.encrypted_key
          )
          setSymmetricKey(decryptedKey)
        }

        // Advanced mode: vault-wrapped key
        if (encryptionEnabled && response.encrypted_vault_key) {
          const binaryStr = atob(response.encrypted_vault_key)
          const bytes = new Uint8Array(binaryStr.length)
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i)
          }
          setEncryptedVaultKey(bytes.buffer)
        }

        onAccepted(response)
      } else if (response.status === ApiLobbyStatus.DENIED) {
        clearWaitingTimeout()
        setStatus(ApiLobbyStatus.DENIED)
      }
      return response
    },
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: true,
    enabled: status === ApiLobbyStatus.WAITING,
  })

  const startWaiting = useCallback(async () => {
    if (encryptionEnabled) {
      // Restore keypair from sessionStorage (survives page refresh)
      // or generate a new one (backend will reset to WAITING if key changed)
      const stored = loadEphemeralKeyPair()
      const keyPair = stored ?? await generateEphemeralKeyPair()
      ephemeralKeyRef.current = keyPair
      ephemeralPublicKeyB64Ref.current = encodePublicKey(keyPair.publicKey)
      if (!stored) {
        saveEphemeralKeyPair(keyPair)
      }
    }
    setStatus(ApiLobbyStatus.WAITING)
    startWaitingTimeout()
  }, [encryptionEnabled, startWaitingTimeout])

  useEffect(() => {
    return () => clearWaitingTimeout()
  }, [clearWaitingTimeout])

  return {
    status,
    startWaiting,
    waitingData,
  }
}
