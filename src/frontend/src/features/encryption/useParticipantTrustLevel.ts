/**
 * Hook that determines a participant's trust level by checking:
 * 1. If they have a registered public key in the encryption library (via VaultClient)
 * 2. If they are authenticated via OIDC
 *
 * Returns "verified" if they have a public key, "authenticated" if OIDC-authenticated,
 * "anonymous" otherwise.
 */
import { useEffect, useState } from 'react'
import { useVaultClient } from './VaultClientProvider'
import type { TrustLevel } from './types'

export function useParticipantTrustLevel(
  attributes: Record<string, string> | undefined
): TrustLevel {
  const { client: vaultClient } = useVaultClient()
  const [hasPublicKey, setHasPublicKey] = useState(false)

  const isAuthenticated = attributes?.is_authenticated === 'true'
  const suiteUserId = attributes?.suite_user_id

  useEffect(() => {
    if (!vaultClient || !suiteUserId || !isAuthenticated) {
      setHasPublicKey(false)
      return
    }

    let cancelled = false

    vaultClient
      .fetchPublicKeys([suiteUserId])
      .then(({ publicKeys }) => {
        if (!cancelled && publicKeys[suiteUserId]) {
          setHasPublicKey(true)
        }
      })
      .catch(() => {
        // VaultClient not available or user has no public key
      })

    return () => {
      cancelled = true
    }
  }, [vaultClient, suiteUserId, isAuthenticated])

  if (hasPublicKey) return 'verified'
  if (isAuthenticated) return 'authenticated'
  return 'anonymous'
}
