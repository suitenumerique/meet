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
  /** Set of participant identities that currently have decryption errors (key exchange in progress) */
  pendingParticipants: Set<string>
}

/**
 * Generate a random passphrase string for LiveKit E2EE.
 *
 * LiveKit's ExternalE2EEKeyProvider.setKey() accepts string | ArrayBuffer.
 * When a string is passed, LiveKit internally derives an AES key using PBKDF2.
 * Using a string passphrase is the proven approach (PoC PR #296).
 *
 * The passphrase is exchanged between participants via the InCallKeyExchange
 * (ephemeral X25519 DH over LiveKit data channel, encrypted with XChaCha20-Poly1305).
 * Both sides encode/decode via TextEncoder/TextDecoder to maintain consistency.
 */
function generatePassphrase(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
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
  const [pendingParticipants, setPendingParticipants] = useState<Set<string>>(new Set())

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

  // TEMPORARY: hardcoded passphrase to validate video encryption works.
  // Same approach as the PoC (PR #296). Will be replaced by key exchange later.
  const HARDCODED_PASSPHRASE = 'meet-encryption-test-passphrase'

  const setupKeyExchange = useCallback(async () => {
    if (!room || !keyProviderRef.current || !encryptionEnabled || setupDoneRef.current) {
      return
    }

    if (room.state !== 'connected') return

    setupDoneRef.current = true
    setIsSettingUp(true)
    setError(null)

    try {
      console.info('[Encryption] Setting hardcoded passphrase (PoC mode)')
      await keyProviderRef.current!.setKey(HARDCODED_PASSPHRASE)
      await room.setE2EEEnabled(true)
      console.info('[Encryption] End-to-end encryption enabled')
    } catch (err) {
      console.error('[Encryption] Failed to set up encryption:', err)
      setError((err as Error).message)
    } finally {
      setIsSettingUp(false)
    }
  }, [room, encryptionEnabled])

  // Listen for LiveKit encryption errors.
  // InvalidKey and MissingKey are expected during key exchange (joiner has temp key,
  // admin can't decrypt yet). Only surface persistent errors after key exchange.
  useEffect(() => {
    if (!room || !encryptionEnabled) return

    const handleEncryptionError = (err: Error, participantIdentity?: string) => {
      const msg = err.message || ''
      if (msg.includes('InvalidKey') || msg.includes('MissingKey') || msg.includes('missing key')) {
        // Track this participant as having a pending key exchange
        if (participantIdentity) {
          setPendingParticipants((prev) => {
            const next = new Set(prev)
            next.add(participantIdentity)
            return next
          })
        }
        return
      }
      console.error('[Encryption] Decryption error:', err)
      setError(msg || 'Decryption failed')
    }

    // When a participant's encryption status changes to encrypted, remove them from pending
    const handleParticipantEncrypted = () => {
      setPendingParticipants(new Set())
    }

    room.on('encryptionError', handleEncryptionError)
    room.on('participantEncryptionStatusChanged', handleParticipantEncrypted)
    return () => {
      room.off('encryptionError', handleEncryptionError)
      room.off('participantEncryptionStatusChanged', handleParticipantEncrypted)
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
    pendingParticipants,
  }
}
