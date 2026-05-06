/**
 * Passphrase utilities for end-to-end encryption.
 *
 * The passphrase is appended to a room URL as the hash fragment
 * (e.g. `https://meet.example.com/abc-defg-hij#<passphrase>`). The
 * server never sees it; participants share it by sharing the link.
 */

/**
 * Number of random bytes used to seed a passphrase.
 * Each byte is rendered as 2 base36 characters, so the resulting
 * passphrase is 48 characters long.
 */
const PASSPHRASE_BYTES = 24

/** Length, in characters, of a generated passphrase. */
export const PASSPHRASE_LENGTH = PASSPHRASE_BYTES * 2

/** Generate a random passphrase suitable for room E2E encryption. */
export function generatePassphrase(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(PASSPHRASE_BYTES)))
    .map((b) => b.toString(36).padStart(2, '0'))
    .join('')
}

/** Whether a string looks like a valid passphrase. */
export function isValidPassphrase(value: string): boolean {
  return value.length === PASSPHRASE_LENGTH && /^[a-z0-9]+$/.test(value)
}

/** Read the current URL hash (without the leading `#`). */
export function getPassphraseFromHash(): string {
  return window.location.hash.replace(/^#/, '')
}
