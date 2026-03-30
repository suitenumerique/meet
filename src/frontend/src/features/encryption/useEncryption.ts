/**
 * Hook that orchestrates end-to-end encryption for a LiveKit room.
 *
 * Architecture:
 * - The room admin/owner is the KEY AUTHORITY — they generate the symmetric key
 * - Other participants wait in the lobby until the admin accepts them
 * - When accepted and connected, non-admin participants request the key from the admin
 * - Key distribution is hybrid:
 *   - If participant has a registered public key (encryption onboarding) → PKI → "verified" trust
 *   - If participant is ProConnect-authenticated → ephemeral DH → "authenticated" trust
 *   - If participant is anonymous → ephemeral DH → "anonymous" trust
 *
 * The admin can be any participant with room_admin=true (OWNER or ADMIN role).
 * If multiple admins exist, any of them can distribute the key.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ExternalE2EEKeyProvider, Room, E2EEOptions } from 'livekit-client'
import { InCallKeyExchange } from './InCallKeyExchange'

export interface EncryptionState {
  isEnabled: boolean
  isSettingUp: boolean
  error: string | null
  /** E2EE options to pass to RoomOptions.e2ee at Room construction time */
  encryptionOptions: E2EEOptions | undefined
}

/**
 * Generate a random passphrase for LiveKit E2EE.
 * LiveKit's ExternalE2EEKeyProvider.setKey() works best with string passphrases
 * (as proven in the PoC PR #296). The worker derives the actual AES key internally.
 */
function generatePassphrase(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  // Convert to base64url string — LiveKit derives the actual encryption key from this
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

/**
 * Check if the local participant is a room admin/owner.
 */
function isLocalParticipantAdmin(room: Room): boolean {
  const attributes = room.localParticipant.attributes
  return attributes?.room_admin === 'true'
}

/**
 * Hook to manage encryption lifecycle for a LiveKit room.
 *
 * Usage in Conference.tsx:
 * 1. Call useEncryption(room, encryptionEnabled) — returns encryptionOptions
 * 2. Pass encryptionOptions to RoomOptions.e2ee when creating the Room
 * 3. The hook handles key exchange automatically once the room is connected
 *
 * @param room - The LiveKit Room instance (can be undefined initially)
 * @param encryptionEnabled - Whether encryption is enabled for this room
 */
export function useEncryption(
  room: Room | undefined,
  encryptionEnabled: boolean
): EncryptionState {
  const [isSettingUp, setIsSettingUp] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Create keyProvider and worker as refs so they're available synchronously
  // for RoomOptions.e2ee. They persist across renders.
  const keyProviderRef = useRef<ExternalE2EEKeyProvider | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const keyExchangeRef = useRef<InCallKeyExchange | null>(null)
  const setupDoneRef = useRef(false)

  if (encryptionEnabled && !keyProviderRef.current) {
    keyProviderRef.current = new ExternalE2EEKeyProvider()
  }
  if (encryptionEnabled && !workerRef.current && typeof window !== 'undefined') {
    workerRef.current = new Worker(
      new URL('livekit-client/e2ee-worker', import.meta.url)
    )
  }

  // Cleanup worker on unmount
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate()
        workerRef.current = null
      }
      keyProviderRef.current = null
    }
  }, [])

  // Build the encryption options for RoomOptions.e2ee
  const encryptionOptions: E2EEOptions | undefined =
    encryptionEnabled && keyProviderRef.current && workerRef.current
      ? { keyProvider: keyProviderRef.current, worker: workerRef.current }
      : undefined

  // Key exchange: once room is connected, the admin generates or distributes the key
  const setupKeyExchange = useCallback(async () => {
    if (!room || !keyProviderRef.current || !encryptionEnabled || setupDoneRef.current) {
      return
    }

    if (room.state !== 'connected') return

    setupDoneRef.current = true
    setIsSettingUp(true)
    setError(null)

    try {
      const keyExchange = new InCallKeyExchange(room)
      keyExchangeRef.current = keyExchange
      keyExchange.startListening()

      const isAdmin = isLocalParticipantAdmin(room)

      let passphrase: string

      if (isAdmin) {
        const existingAdmins = Array.from(
          room.remoteParticipants.values()
        ).filter((p) => p.attributes?.room_admin === 'true')

        if (existingAdmins.length > 0) {
          console.info(
            '[Encryption] Another admin is present, requesting passphrase...'
          )
          const keyBytes = await keyExchange.requestKey()
          keyExchange.setSymmetricKey(keyBytes)
          passphrase = new TextDecoder().decode(keyBytes)
          console.info('[Encryption] Received passphrase from existing admin')
        } else {
          passphrase = generatePassphrase()
          const keyBytes = new TextEncoder().encode(passphrase)
          keyExchange.setSymmetricKey(keyBytes)
          console.info(
            '[Encryption] Generated passphrase as room admin (key authority)'
          )
        }
      } else {
        console.info(
          '[Encryption] Requesting passphrase from room admin...'
        )
        const keyBytes = await keyExchange.requestKey()
        keyExchange.setSymmetricKey(keyBytes)
        passphrase = new TextDecoder().decode(keyBytes)
        console.info('[Encryption] Received passphrase from admin')
      }

      // Feed the passphrase to LiveKit's encryption worker.
      // Using a string passphrase (as in the PoC PR #296) — LiveKit derives
      // the actual AES encryption key internally from this passphrase.
      console.info('[Encryption] Setting passphrase, length:', passphrase.length)
      await keyProviderRef.current!.setKey(passphrase)
      await room.setE2EEEnabled(true)

      console.info('[Encryption] End-to-end encryption enabled')
    } catch (err) {
      console.error('[Encryption] Failed to set up encryption:', err)
      setError((err as Error).message)
    } finally {
      setIsSettingUp(false)
    }
  }, [room, encryptionEnabled])

  // Listen for LiveKit encryption errors (decryption failures, key mismatches)
  useEffect(() => {
    if (!room || !encryptionEnabled) return

    const handleEncryptionError = (err: Error) => {
      console.error('[Encryption] Decryption error:', err)
      setError(err.message || 'Decryption failed')
    }

    room.on('encryptionError', handleEncryptionError)
    return () => {
      room.off('encryptionError', handleEncryptionError)
    }
  }, [room, encryptionEnabled])

  useEffect(() => {
    if (!room || !encryptionEnabled) return

    const handleConnected = () => {
      setupKeyExchange()
    }

    if (room.state === 'connected') {
      setupKeyExchange()
    } else {
      room.on('connected', handleConnected)
    }

    return () => {
      room.off('connected', handleConnected)
      if (keyExchangeRef.current) {
        keyExchangeRef.current.stopListening()
        keyExchangeRef.current = null
      }
      setupDoneRef.current = false
    }
  }, [room, encryptionEnabled, setupKeyExchange])

  return {
    isEnabled: encryptionEnabled,
    isSettingUp,
    error,
    encryptionOptions,
  }
}
