/**
 * Trust level for a participant's encryption key distribution.
 *
 * - 'verified': Key was distributed via PKI (public key registered in encryption library).
 *   Identity is cryptographically verified.
 * - 'authenticated': Key was distributed via ephemeral DH, but participant is authenticated
 *   via ProConnect. Identity is server-verified, not cryptographically.
 * - 'anonymous': Key was distributed via ephemeral DH, participant is not authenticated.
 *   Identity is self-declared.
 */
export type TrustLevel = 'verified' | 'authenticated' | 'anonymous'

/**
 * Metadata attached to participant attributes for encryption trust level.
 */
export const PARTICIPANT_TRUST_ATTR = 'encryption.trustLevel'

/**
 * Data channel topic for encryption key exchange protocol.
 */
export const KEY_EXCHANGE_TOPIC = 'encryption-key-exchange'

/**
 * Message types for the in-call key exchange protocol.
 */
export enum KeyExchangeMessageType {
  /** New participant sends their ephemeral public key to request the symmetric key */
  KEY_REQUEST = 'KEY_REQUEST',
  /** Existing participant responds with the symmetric key encrypted for the requester */
  KEY_RESPONSE = 'KEY_RESPONSE',
  /** Requester confirms receipt of the key */
  KEY_ACK = 'KEY_ACK',
}

export interface KeyExchangeMessage {
  type: KeyExchangeMessageType
  /** Sender's participant identity */
  senderIdentity: string
  /** Target participant identity (for directed messages) */
  targetIdentity?: string
  /** Base64-encoded payload */
  payload: string
}
