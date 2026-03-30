/**
 * Hybrid key distributor: determines the best key distribution method per participant.
 *
 * For each participant joining an encrypted call:
 * 1. Check if they have a registered public key (via VaultClient/encryption library)
 *    → If YES: wrap symmetric key with their public key (PKI path) → trust level "verified"
 * 2. Check if they are authenticated via ProConnect
 *    → If YES but no public key: use ephemeral DH → trust level "authenticated"
 * 3. Otherwise: use ephemeral DH → trust level "anonymous"
 *
 * The symmetric key is always the same for everyone — only the distribution channel varies.
 */
import type { TrustLevel } from './types'
import { PARTICIPANT_TRUST_ATTR } from './types'

export interface ParticipantEncryptionInfo {
  identity: string
  trustLevel: TrustLevel
  hasPublicKey: boolean
  isAuthenticated: boolean
}

/**
 * Determine the trust level for a participant based on their encryption capabilities.
 */
export function determineTrustLevel(
  hasPublicKey: boolean,
  isAuthenticated: boolean
): TrustLevel {
  if (hasPublicKey) return 'verified'
  if (isAuthenticated) return 'authenticated'
  return 'anonymous'
}

/**
 * Derive trust level from participant's server-signed attributes.
 *
 * The `is_authenticated` attribute is set by the backend in the LiveKit JWT token
 * and cannot be spoofed by clients. It indicates whether the participant
 * authenticated via OIDC (ProConnect/Keycloak).
 *
 * TODO: Once VaultClient integration is complete, also check for registered
 * public keys to distinguish "verified" (PKI) from "authenticated" (ephemeral).
 */
export function getTrustLevelFromAttributes(
  attributes: Record<string, string> | undefined
): TrustLevel | null {
  if (!attributes) return null

  // Check for explicit trust level (set by future PKI integration)
  const explicitLevel = attributes[PARTICIPANT_TRUST_ATTR]
  if (explicitLevel === 'verified' || explicitLevel === 'authenticated' || explicitLevel === 'anonymous') {
    return explicitLevel
  }

  // Derive from server-signed is_authenticated attribute
  if (attributes.is_authenticated === 'true') {
    return 'authenticated'
  }

  return 'anonymous'
}

/**
 * Try to distribute the symmetric key via PKI (encryption library).
 * Returns true if successful, false if the participant doesn't have a public key.
 */
export async function distributeKeyViaPKI(
  vaultClient: VaultClient,
  symmetricKey: Uint8Array,
  participantUserId: string
): Promise<{ success: boolean; encryptedKey?: ArrayBuffer }> {
  try {
    const { publicKeys } = await vaultClient.fetchPublicKeys([
      participantUserId,
    ])
    const publicKey = publicKeys[participantUserId]

    if (!publicKey) {
      return { success: false }
    }

    // Use encryptWithoutKey to wrap the symmetric key for this user
    const { encryptedKeys } = await vaultClient.shareKeys(
      symmetricKey.buffer as ArrayBuffer,
      { [participantUserId]: publicKey }
    )

    const encryptedKey = encryptedKeys[participantUserId]
    if (!encryptedKey) {
      return { success: false }
    }

    return { success: true, encryptedKey }
  } catch (err) {
    console.warn(
      '[Encryption] PKI key distribution failed for participant:',
      participantUserId,
      err
    )
    return { success: false }
  }
}

/**
 * Encode trust level into participant attributes for badge display.
 */
export function encodeTrustLevelAttribute(
  trustLevel: TrustLevel
): Record<string, string> {
  return { [PARTICIPANT_TRUST_ATTR]: trustLevel }
}
