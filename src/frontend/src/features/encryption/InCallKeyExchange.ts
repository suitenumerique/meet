/**
 * In-call key exchange protocol using ephemeral X25519 Diffie-Hellman
 * over LiveKit's reliable data channel.
 *
 * Uses libsodium (same as the encryption library) for algorithmic consistency:
 * - X25519 for ephemeral key exchange (crypto_scalarmult)
 * - XChaCha20-Poly1305 for encrypting the symmetric key (crypto_secretbox)
 * - BLAKE2b for deriving a shared key from the ECDH shared secret (crypto_generichash)
 *
 * Protocol:
 * 1. New participant generates ephemeral X25519 key pair
 * 2. Sends KEY_REQUEST with their ephemeral public key to the room
 * 3. An admin (room_admin=true) who has the symmetric key responds with KEY_RESPONSE:
 *    - Generates their own ephemeral X25519 key pair
 *    - Derives shared secret via X25519(their ephemeral secret, requester's public key)
 *    - Derives encryption key via BLAKE2b(shared secret)
 *    - Encrypts the symmetric key with XChaCha20-Poly1305 using the derived key
 * 4. Requester derives the same shared secret and decrypts the symmetric key
 * 5. Requester sends KEY_ACK to confirm receipt
 *
 * Security:
 * - Only KEY_RESPONSE from participants with room_admin=true are accepted
 * - LiveKit's participant identity is server-verified (JWT-signed), so admin status cannot be spoofed
 * - Each exchange uses unique ephemeral key pairs (forward secrecy per exchange)
 * - Waiting room participants cannot send data channel messages (they're not in the LiveKit room)
 */
import _sodium from 'libsodium-wrappers-sumo'
import {
  KeyExchangeMessage,
  KeyExchangeMessageType,
  KEY_EXCHANGE_TOPIC,
} from './types'
import type { Room, RemoteParticipant } from 'livekit-client'

// Ensure libsodium is initialized
let sodiumReady: Promise<void> | null = null
async function ensureSodium(): Promise<typeof _sodium> {
  if (!sodiumReady) {
    sodiumReady = _sodium.ready
  }
  await sodiumReady
  return _sodium
}

// Helpers for base64 encoding/decoding
function toBase64(bytes: Uint8Array): string {
  const sodium = _sodium
  return sodium.to_base64(bytes, sodium.base64_variants.URLSAFE_NO_PADDING)
}

function fromBase64(base64: string): Uint8Array {
  const sodium = _sodium
  return sodium.from_base64(base64, sodium.base64_variants.URLSAFE_NO_PADDING)
}

/**
 * Generate an ephemeral X25519 key pair using libsodium.
 */
async function generateEphemeralKeyPair(): Promise<{
  publicKey: Uint8Array
  secretKey: Uint8Array
}> {
  const sodium = await ensureSodium()
  const secretKey = sodium.randombytes_buf(sodium.crypto_scalarmult_SCALARBYTES)
  const publicKey = sodium.crypto_scalarmult_base(secretKey)
  return { publicKey, secretKey }
}

/**
 * Derive a shared secret from X25519 ECDH, then derive an encryption key via BLAKE2b.
 * Uses the same pattern as the encryption library's hybridEncapsulate/hybridDecapsulate.
 */
async function deriveSharedKey(
  mySecretKey: Uint8Array,
  theirPublicKey: Uint8Array
): Promise<Uint8Array> {
  const sodium = await ensureSodium()
  // X25519 scalar multiplication to get raw shared secret
  const rawSharedSecret = sodium.crypto_scalarmult(mySecretKey, theirPublicKey)
  // Derive a 32-byte key using BLAKE2b with a domain-separation tag
  return sodium.crypto_generichash(
    32,
    rawSharedSecret,
    sodium.from_string('meet-key-exchange')
  )
}

/**
 * Encrypt the symmetric key using XChaCha20-Poly1305 (same as encryption library).
 * Returns nonce + ciphertext.
 */
async function encryptWithSharedKey(
  sharedKey: Uint8Array,
  symmetricKey: Uint8Array
): Promise<Uint8Array> {
  const sodium = await ensureSodium()
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)
  const ciphertext = sodium.crypto_secretbox_easy(symmetricKey, nonce, sharedKey)
  // Prepend nonce to ciphertext (same format as encryption library)
  const result = new Uint8Array(nonce.length + ciphertext.length)
  result.set(nonce, 0)
  result.set(ciphertext, nonce.length)
  return result
}

/**
 * Decrypt the symmetric key using XChaCha20-Poly1305.
 */
async function decryptWithSharedKey(
  sharedKey: Uint8Array,
  encryptedData: Uint8Array
): Promise<Uint8Array> {
  const sodium = await ensureSodium()
  const nonce = encryptedData.slice(0, sodium.crypto_secretbox_NONCEBYTES)
  const ciphertext = encryptedData.slice(sodium.crypto_secretbox_NONCEBYTES)
  return sodium.crypto_secretbox_open_easy(ciphertext, nonce, sharedKey)
}

/**
 * Check if a participant is a room admin (server-verified via JWT).
 */
function isParticipantAdmin(
  participant: { attributes?: Record<string, string> } | undefined
): boolean {
  return participant?.attributes?.room_admin === 'true'
}

/**
 * Manages the in-call key exchange protocol for a single participant.
 */
export class InCallKeyExchange {
  private room: Room
  private symmetricKey: Uint8Array | null = null
  private ephemeralKeyPair: {
    publicKey: Uint8Array
    secretKey: Uint8Array
  } | null = null
  private onKeyReceived: ((key: Uint8Array) => void) | null = null
  private boundHandleMessage: (
    payload: Uint8Array,
    participant: RemoteParticipant | undefined,
    kind: unknown,
    topic: string | undefined
  ) => void

  constructor(room: Room) {
    this.room = room
    this.boundHandleMessage = this.handleDataMessage.bind(this)
  }

  /**
   * Start listening for key exchange messages on the data channel.
   */
  startListening(): void {
    this.room.on('dataReceived', this.boundHandleMessage)
  }

  /**
   * Stop listening and clean up.
   */
  stopListening(): void {
    this.room.off('dataReceived', this.boundHandleMessage)
    this.ephemeralKeyPair = null
  }

  /**
   * Set the symmetric key (for admins who generate or receive it).
   */
  setSymmetricKey(key: Uint8Array): void {
    this.symmetricKey = key
  }

  /**
   * Check if we already have the symmetric key.
   */
  hasKey(): boolean {
    return this.symmetricKey !== null
  }

  /**
   * Request the symmetric key from admin participants in the room.
   * Returns a promise that resolves when the key is received from a verified admin.
   */
  async requestKey(timeoutMs = 15000): Promise<Uint8Array> {
    await ensureSodium()

    // Generate ephemeral key pair for this exchange
    this.ephemeralKeyPair = await generateEphemeralKeyPair()

    return new Promise<Uint8Array>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.onKeyReceived = null
        reject(new Error('Key exchange timeout: no admin responded'))
      }, timeoutMs)

      this.onKeyReceived = (key: Uint8Array) => {
        clearTimeout(timeout)
        this.symmetricKey = key
        resolve(key)
      }

      // Send KEY_REQUEST with our ephemeral public key
      const message: KeyExchangeMessage = {
        type: KeyExchangeMessageType.KEY_REQUEST,
        senderIdentity: this.room.localParticipant.identity,
        payload: toBase64(this.ephemeralKeyPair!.publicKey),
      }

      this.sendMessage(message)
    })
  }

  /**
   * Handle incoming data channel messages.
   * The `participant` parameter is provided by LiveKit and contains
   * the server-verified identity and attributes (from JWT).
   */
  private async handleDataMessage(
    payload: Uint8Array,
    participant: RemoteParticipant | undefined,
    _kind: unknown,
    topic: string | undefined
  ): Promise<void> {
    if (topic !== KEY_EXCHANGE_TOPIC) return

    try {
      const text = new TextDecoder().decode(payload)
      const message: KeyExchangeMessage = JSON.parse(text)

      // Ignore our own messages
      if (message.senderIdentity === this.room.localParticipant.identity) return

      switch (message.type) {
        case KeyExchangeMessageType.KEY_REQUEST:
          await this.handleKeyRequest(message, participant)
          break
        case KeyExchangeMessageType.KEY_RESPONSE:
          await this.handleKeyResponse(message, participant)
          break
        case KeyExchangeMessageType.KEY_ACK:
          break
      }
    } catch (err) {
      console.error('[Encryption] Error handling key exchange message:', err)
    }
  }

  /**
   * Handle a KEY_REQUEST: if we're an admin with the symmetric key,
   * respond with it encrypted using the requester's ephemeral public key.
   *
   * Only admins respond to key requests, ensuring the key authority model.
   */
  private async handleKeyRequest(
    message: KeyExchangeMessage,
    _participant: RemoteParticipant | undefined
  ): Promise<void> {
    if (!this.symmetricKey) return

    // Only admins distribute the symmetric key
    if (!isParticipantAdmin({ attributes: this.room.localParticipant.attributes })) {
      return
    }

    // Only respond if the message is for us or broadcast
    if (
      message.targetIdentity &&
      message.targetIdentity !== this.room.localParticipant.identity
    ) {
      return
    }

    try {
      // Generate our own ephemeral key pair for this exchange
      const responderKeyPair = await generateEphemeralKeyPair()

      // Import the requester's public key
      const requesterPublicKey = fromBase64(message.payload)

      // Derive shared key using X25519 + BLAKE2b
      const sharedKey = await deriveSharedKey(
        responderKeyPair.secretKey,
        requesterPublicKey
      )

      // Encrypt the symmetric key with XChaCha20-Poly1305
      const encryptedKey = await encryptWithSharedKey(sharedKey, this.symmetricKey)

      // Send response with our public key + encrypted symmetric key
      const responsePayload = JSON.stringify({
        responderPublicKey: toBase64(responderKeyPair.publicKey),
        encryptedKey: toBase64(encryptedKey),
      })

      const response: KeyExchangeMessage = {
        type: KeyExchangeMessageType.KEY_RESPONSE,
        senderIdentity: this.room.localParticipant.identity,
        targetIdentity: message.senderIdentity,
        payload: btoa(responsePayload),
      }

      this.sendMessage(response)
    } catch (err) {
      console.error('[Encryption] Error responding to key request:', err)
    }
  }

  /**
   * Handle a KEY_RESPONSE: decrypt the symmetric key using our ephemeral private key.
   *
   * SECURITY: Only accept KEY_RESPONSE from participants with room_admin=true.
   * The admin attribute is set by the server (via JWT) and cannot be spoofed by clients.
   */
  private async handleKeyResponse(
    message: KeyExchangeMessage,
    participant: RemoteParticipant | undefined
  ): Promise<void> {
    // Only process if directed at us
    if (message.targetIdentity !== this.room.localParticipant.identity) return

    // SECURITY: Verify the sender is a room admin
    // The `participant` object comes from LiveKit with server-verified attributes (JWT-signed)
    if (!isParticipantAdmin(participant)) {
      console.warn(
        '[Encryption] Rejected KEY_RESPONSE from non-admin participant:',
        message.senderIdentity
      )
      return
    }

    if (!this.ephemeralKeyPair) {
      console.warn('[Encryption] Received key response but no ephemeral key pair')
      return
    }

    try {
      const responsePayload = JSON.parse(atob(message.payload))
      const responderPublicKey = fromBase64(responsePayload.responderPublicKey)

      // Derive shared key using our ephemeral secret + responder's public key
      const sharedKey = await deriveSharedKey(
        this.ephemeralKeyPair.secretKey,
        responderPublicKey
      )

      // Decrypt the symmetric key with XChaCha20-Poly1305
      const encryptedKey = fromBase64(responsePayload.encryptedKey)
      const symmetricKey = await decryptWithSharedKey(sharedKey, encryptedKey)

      // Send ACK
      const ack: KeyExchangeMessage = {
        type: KeyExchangeMessageType.KEY_ACK,
        senderIdentity: this.room.localParticipant.identity,
        targetIdentity: message.senderIdentity,
        payload: '',
      }
      this.sendMessage(ack)

      // Clean up ephemeral key pair
      this.ephemeralKeyPair = null

      // Notify that we received the key
      if (this.onKeyReceived) {
        this.onKeyReceived(symmetricKey)
        this.onKeyReceived = null
      }
    } catch (err) {
      console.error('[Encryption] Error handling key response:', err)
    }
  }

  /**
   * Send a key exchange message via LiveKit data channel.
   */
  private sendMessage(message: KeyExchangeMessage): void {
    const data = new TextEncoder().encode(JSON.stringify(message))
    this.room.localParticipant.publishData(data, {
      reliable: true,
      topic: KEY_EXCHANGE_TOPIC,
    })
  }
}
