/**
 * Passphrase utilities for end-to-end encryption.
 *
 * The passphrase is appended to a room URL as the hash fragment
 * (e.g. `https://meet.example.com/abc-defg-hij#<passphrase>`). The
 * server never sees it; participants share it by sharing the link.
 *
 * Encoding is plain hex so that the validator's regex matches exactly
 * what the generator produces: 48 lowercase hex characters = 192 bits
 * of entropy, no overlap with looser "looks like a passphrase" inputs.
 */

const PASSPHRASE_BYTES = 24

/** Length, in characters, of a generated passphrase. */
export const PASSPHRASE_LENGTH = PASSPHRASE_BYTES * 2

/** Generate a random passphrase suitable for an encrypted room. */
export function generatePassphrase(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(PASSPHRASE_BYTES)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Whether a string is exactly a generator-shaped passphrase. */
export function isValidPassphrase(value: string): boolean {
  return value.length === PASSPHRASE_LENGTH && /^[0-9a-f]+$/.test(value)
}

/** Read the current URL hash (without the leading `#`). */
export function getPassphraseFromHash(): string {
  return window.location.hash.replace(/^#/, '')
}
