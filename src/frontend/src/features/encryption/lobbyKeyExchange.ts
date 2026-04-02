/**
 * Lobby-based key exchange using ephemeral X25519 Diffie-Hellman.
 *
 * The key exchange happens during the waiting room flow via the REST API,
 * so the joiner already has the real symmetric key when connecting to LiveKit.
 *
 * Uses libsodium for algorithmic consistency:
 * - X25519 for ephemeral key exchange (crypto_scalarmult)
 * - XChaCha20-Poly1305 for encrypting the symmetric key (crypto_secretbox)
 * - BLAKE2b for deriving a shared key from the ECDH shared secret (crypto_generichash)
 */
import _sodium from 'libsodium-wrappers-sumo'

let sodiumReady: Promise<void> | null = null
async function ensureSodium(): Promise<typeof _sodium> {
  if (!sodiumReady) {
    sodiumReady = _sodium.ready
  }
  await sodiumReady
  return _sodium
}

function toBase64(bytes: Uint8Array): string {
  return _sodium.to_base64(bytes, _sodium.base64_variants.URLSAFE_NO_PADDING)
}

function fromBase64(base64: string): Uint8Array {
  return _sodium.from_base64(base64, _sodium.base64_variants.URLSAFE_NO_PADDING)
}

/**
 * Generate an ephemeral X25519 key pair.
 */
export async function generateEphemeralKeyPair(): Promise<{
  publicKey: Uint8Array
  secretKey: Uint8Array
}> {
  const sodium = await ensureSodium()
  const secretKey = sodium.randombytes_buf(sodium.crypto_scalarmult_SCALARBYTES)
  const publicKey = sodium.crypto_scalarmult_base(secretKey)
  return { publicKey, secretKey }
}

/**
 * Encode a public key to base64url for transmission via REST API.
 */
export function encodePublicKey(publicKey: Uint8Array): string {
  return toBase64(publicKey)
}

// Module-level symmetric key — only accessible via set/get, never exposed to React components.
let _symmetricKey: Uint8Array | null = null

/**
 * Store the room's symmetric key in module scope.
 * Called once by the admin (after generating it) or by the joiner (after decrypting it).
 */
export function setSymmetricKey(key: Uint8Array): void {
  _symmetricKey = key
}

/**
 * Retrieve the stored symmetric key. Returns null if not yet set.
 */
export function getSymmetricKey(): Uint8Array | null {
  return _symmetricKey
}

const EPHEMERAL_KEY_STORAGE_KEY = 'meet-ephemeral-keypair'

/**
 * Persist the ephemeral keypair in sessionStorage so it survives page refreshes.
 * sessionStorage is cleared when the tab/browser closes — in that case the backend
 * resets the participant to WAITING so the admin re-accepts with a fresh key.
 */
export function saveEphemeralKeyPair(keyPair: { publicKey: Uint8Array; secretKey: Uint8Array }): void {
  try {
    sessionStorage.setItem(EPHEMERAL_KEY_STORAGE_KEY, JSON.stringify({
      publicKey: toBase64(keyPair.publicKey),
      secretKey: toBase64(keyPair.secretKey),
    }))
  } catch {
    // sessionStorage may be unavailable
  }
}

/**
 * Restore the ephemeral keypair from sessionStorage.
 */
export function loadEphemeralKeyPair(): { publicKey: Uint8Array; secretKey: Uint8Array } | null {
  try {
    const stored = sessionStorage.getItem(EPHEMERAL_KEY_STORAGE_KEY)
    if (!stored) return null
    const parsed = JSON.parse(stored)
    return {
      publicKey: fromBase64(parsed.publicKey),
      secretKey: fromBase64(parsed.secretKey),
    }
  } catch {
    return null
  }
}

/**
 * Clear the stored symmetric key (e.g. on disconnect).
 */
export function clearSymmetricKey(): void {
  _symmetricKey = null
}

// Module-level encrypted vault key — for advanced mode, stores the vault-wrapped key
let _encryptedVaultKey: ArrayBuffer | null = null

export function setEncryptedVaultKey(key: ArrayBuffer): void {
  _encryptedVaultKey = key
}

export function getEncryptedVaultKey(): ArrayBuffer | null {
  return _encryptedVaultKey
}

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

/**
 * Derive a shared secret from X25519 ECDH, then derive an encryption key via BLAKE2b.
 */
async function deriveSharedKey(
  mySecretKey: Uint8Array,
  theirPublicKey: Uint8Array
): Promise<Uint8Array> {
  const sodium = await ensureSodium()
  const rawSharedSecret = sodium.crypto_scalarmult(mySecretKey, theirPublicKey)
  return sodium.crypto_generichash(
    32,
    rawSharedSecret,
    sodium.from_string('meet-key-exchange')
  )
}

/**
 * Admin-side: encrypt the room's symmetric key for a specific participant.
 *
 * Called when the admin accepts a participant from the waiting room.
 * Generates an ephemeral keypair, performs DH with the participant's public key,
 * and encrypts the symmetric key. Reads the key from module-level storage.
 *
 * @param participantPublicKeyB64 - The participant's ephemeral public key (base64url)
 * @returns The encrypted key blob and admin's ephemeral public key (both base64url)
 */
export async function encryptKeyForParticipant(
  participantPublicKeyB64: string
): Promise<{ encryptedKey: string; adminPublicKey: string }> {
  const symmetricKey = _symmetricKey
  if (!symmetricKey) {
    throw new Error('Symmetric key not set — cannot encrypt for participant')
  }
  const sodium = await ensureSodium()

  const adminKeyPair = await generateEphemeralKeyPair()
  const participantPublicKey = fromBase64(participantPublicKeyB64)

  const sharedKey = await deriveSharedKey(
    adminKeyPair.secretKey,
    participantPublicKey
  )

  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)
  const ciphertext = sodium.crypto_secretbox_easy(symmetricKey, nonce, sharedKey)
  const encrypted = new Uint8Array(nonce.length + ciphertext.length)
  encrypted.set(nonce, 0)
  encrypted.set(ciphertext, nonce.length)

  return {
    encryptedKey: toBase64(encrypted),
    adminPublicKey: toBase64(adminKeyPair.publicKey),
  }
}

/**
 * Joiner-side: decrypt the symmetric key received from the admin via the lobby.
 *
 * Called when the joiner's polling receives an ACCEPTED status with encryption data.
 *
 * @param mySecretKey - The joiner's ephemeral secret key
 * @param adminPublicKeyB64 - The admin's ephemeral public key (base64url)
 * @param encryptedKeyB64 - The encrypted symmetric key blob (base64url)
 * @returns The decrypted symmetric key
 */
export async function decryptKeyFromAdmin(
  mySecretKey: Uint8Array,
  adminPublicKeyB64: string,
  encryptedKeyB64: string
): Promise<Uint8Array> {
  const sodium = await ensureSodium()

  const adminPublicKey = fromBase64(adminPublicKeyB64)
  const encryptedData = fromBase64(encryptedKeyB64)

  const sharedKey = await deriveSharedKey(mySecretKey, adminPublicKey)

  const nonce = encryptedData.slice(0, sodium.crypto_secretbox_NONCEBYTES)
  const ciphertext = encryptedData.slice(sodium.crypto_secretbox_NONCEBYTES)
  return sodium.crypto_secretbox_open_easy(ciphertext, nonce, sharedKey)
}
