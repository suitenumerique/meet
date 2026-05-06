/**
 * Key storage and passphrase utilities for E2EE lobby flow.
 *
 * Basic mode: passphrase is in the URL hash — shared by sharing the link.
 * Advanced mode: vault-wrapped symmetric key exchanged via lobby REST API.
 */

// ── Module-level symmetric key (basic mode) ───────────────────────────

let _symmetricKey: Uint8Array | null = null

export function setSymmetricKey(key: Uint8Array): void {
  _symmetricKey = key
}

export function getSymmetricKey(): Uint8Array | null {
  return _symmetricKey
}

export function clearSymmetricKey(): void {
  _symmetricKey = null
}

// ── Module-level encrypted vault key (advanced mode) ──────────────────

let _encryptedVaultKey: ArrayBuffer | null = null

export function setEncryptedVaultKey(key: ArrayBuffer): void {
  _encryptedVaultKey = key
}

export function getEncryptedVaultKey(): ArrayBuffer | null {
  return _encryptedVaultKey
}

// ── Passphrase generation (basic mode) ────────────────────────────────

/**
 * Generate a random passphrase for basic mode encryption.
 * 24 random bytes encoded in base36 = 48 alphanumeric characters.
 */
export function generatePassphrase(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map((b) => b.toString(36).padStart(2, '0'))
    .join('')
}

/** Expected length of a basic mode passphrase */
export const BASIC_KEY_LENGTH = 48
