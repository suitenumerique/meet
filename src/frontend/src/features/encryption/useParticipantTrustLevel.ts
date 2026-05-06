/**
 * Hook that determines a participant's trust level and fingerprint status
 * by checking the vault (encryption library) via VaultClient.
 *
 * In advanced mode:
 * - Checks if the participant has a registered public key
 * - Checks the fingerprint status (trusted/refused/unknown)
 * - Returns "verified" only if they have a public key
 *
 * In basic mode:
 * - Only uses authentication status (no vault check)
 */
import { useEffect, useState } from 'react'
import { useVaultClient } from './VaultClientProvider'
import type { TrustLevel } from './types'

/** Compute a fingerprint from a public key (same as encryption repo: SHA-256, first 16 hex chars) */
async function computeFingerprint(publicKey: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', publicKey)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16)
}

/** Format for display: "a1b2c3d4e5f67890" → "A1B2 C3D4 E5F6 7890" */
export function formatFingerprint(fp: string): string {
  return fp.replace(/(.{4})/g, '$1 ').trim().toUpperCase()
}

export type FingerprintStatus = 'loading' | 'trusted' | 'refused' | 'unknown' | 'no-key' | 'error'

export function useParticipantTrustLevel(
  attributes: Record<string, string> | undefined,
  encryptionMode?: string,
  isSelf?: boolean,
): { trustLevel: TrustLevel; fingerprintStatus: FingerprintStatus; fingerprint: string | null } {
  const { client: vaultClient } = useVaultClient()
  const [fingerprintStatus, setFingerprintStatus] = useState<FingerprintStatus>('loading')
  const [fingerprint, setFingerprint] = useState<string | null>(null)

  const isAuthenticated = attributes?.is_authenticated === 'true'
  const suiteUserId = attributes?.suite_user_id
  const isAdvanced = encryptionMode === 'advanced'

  // Re-check when a fingerprint is accepted/refused via VaultClient
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!vaultClient) return
    const handler = () => setRevision((r) => r + 1)
    vaultClient.on('fingerprint-changed', handler)
    return () => { vaultClient.off('fingerprint-changed', handler) }
  }, [vaultClient])

  useEffect(() => {
    if (!isAdvanced || !isAuthenticated) {
      setFingerprintStatus('no-key')
      return
    }
    if (!vaultClient || !suiteUserId) {
      setFingerprintStatus(vaultClient ? 'no-key' : 'error')
      return
    }

    let cancelled = false

    async function check() {
      try {
        const { publicKeys } = await vaultClient!.fetchPublicKeys([suiteUserId!])
        if (cancelled) return

        const publicKey = publicKeys[suiteUserId!]
        if (!publicKey) {
          setFingerprintStatus('no-key')
          return
        }

        // Compute the fingerprint from the public key (SHA-256, first 16 hex chars)
        const fp = await computeFingerprint(publicKey)
        if (cancelled) return
        setFingerprint(fp)

        // Own fingerprint is always trusted — we hold the private key
        if (isSelf) {
          setFingerprintStatus('trusted')
          return
        }

        // Check if we have a known fingerprint in the local registry
        const { fingerprints: known } = await vaultClient!.getKnownFingerprints()
        if (cancelled) return

        const knownEntry = known[suiteUserId!]
        if (!knownEntry) {
          // Never seen — unknown, needs explicit acceptance
          setFingerprintStatus('unknown')
        } else if (knownEntry.fingerprint === fp) {
          // Same fingerprint — use stored status
          setFingerprintStatus(knownEntry.status as FingerprintStatus)
        } else {
          // Different fingerprint — key changed, needs re-verification
          setFingerprintStatus('unknown')
        }
      } catch {
        if (!cancelled) setFingerprintStatus('error')
      }
    }

    check()
    return () => { cancelled = true }
  }, [vaultClient, suiteUserId, isAuthenticated, isAdvanced, isSelf, revision])

  // Derive trust level from fingerprint status
  let trustLevel: TrustLevel
  if (!isAuthenticated) {
    trustLevel = 'anonymous'
  } else if (!isAdvanced) {
    // Basic mode: only authentication matters
    trustLevel = 'authenticated'
  } else if (fingerprintStatus === 'trusted') {
    trustLevel = 'verified'
  } else if (fingerprintStatus === 'refused') {
    trustLevel = 'refused'
  } else if (fingerprintStatus === 'no-key' || fingerprintStatus === 'error') {
    // Authenticated but no vault keys — show as authenticated (blue)
    trustLevel = 'authenticated'
  } else {
    // 'unknown' or 'loading' — has key but not yet verified
    trustLevel = 'unknown'
  }

  return { trustLevel, fingerprintStatus, fingerprint }
}
