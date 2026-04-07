import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { keys } from '@/api/queryKeys'
import {
  requestEntry,
  ApiLobbyStatus,
  ApiRequestEntry,
} from '../api/requestEntry'
import {
  setSymmetricKey,
  setEncryptedVaultKey,
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
      })
      if (response.status === ApiLobbyStatus.ACCEPTED) {
        clearWaitingTimeout()
        setStatus(ApiLobbyStatus.ACCEPTED)

        // Advanced mode: vault-wrapped key
        if (encryptionEnabled && response.encrypted_vault_key) {
          console.info('[VaultE2EE] Joiner: received encrypted_vault_key from lobby, length:', response.encrypted_vault_key.length)
          const binaryStr = atob(response.encrypted_vault_key)
          const bytes = new Uint8Array(binaryStr.length)
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i)
          }
          setEncryptedVaultKey(bytes.buffer)
        } else if (encryptionEnabled) {
          console.warn('[VaultE2EE] Joiner: ACCEPTED but no encrypted_vault_key in response', response)
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
    setStatus(ApiLobbyStatus.WAITING)
    startWaitingTimeout()
  }, [startWaitingTimeout])

  useEffect(() => {
    return () => clearWaitingTimeout()
  }, [clearWaitingTimeout])

  return {
    status,
    startWaiting,
    waitingData,
  }
}
