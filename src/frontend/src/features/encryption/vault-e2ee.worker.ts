/**
 * E2EE Worker — Step 3: libsodium XChaCha20-Poly1305 with preserved codec headers.
 * Same frame format as LiveKit (unencrypted header bytes), but using libsodium
 * instead of crypto.subtle. Hardcoded symmetric key, no VaultClient yet.
 *
 * Frame format:
 *   [unencrypted header][ciphertext + Poly1305 MAC (16B)][nonce (24B)][NONCE_LENGTH (1B)][key index (1B)]
 */
import _sodium from 'libsodium-wrappers-sumo'

let sodium: typeof _sodium
let symmetricKey: Uint8Array | null = null

const KEY_INDEX = 0

// Same as LiveKit's FrameCryptor constants
const UNENCRYPTED_BYTES = {
  key: 10,    // VP8 keyframe
  delta: 3,   // VP8 delta frame
  audio: 1,   // Opus TOC byte
}

async function init() {
  await _sodium.ready
  sodium = _sodium
}

const sodiumReady = init()

function getUnencryptedBytes(frame: RTCEncodedVideoFrame | RTCEncodedAudioFrame): number {
  if (!('type' in frame)) return UNENCRYPTED_BYTES.audio
  return frame.type === 'key' ? UNENCRYPTED_BYTES.key : UNENCRYPTED_BYTES.delta
}

onmessage = async (ev: MessageEvent) => {
  const { kind, data } = ev.data

  switch (kind) {
    case 'init':
      await sodiumReady
      postMessage({ kind: 'initAck', data: { enabled: true } })
      break

    case 'setKey':
      // Store raw symmetric key for libsodium (32 bytes)
      symmetricKey = new Uint8Array(data.key)
      postMessage({
        kind: 'enable',
        data: { enabled: true, participantIdentity: data.participantIdentity },
      })
      break

    case 'encode':
    case 'decode': {
      await sodiumReady
      const { readableStream, writableStream, trackId, participantIdentity } = data
      const operation = kind
      let frameCount = 0

      const transformStream = new TransformStream({
        transform: async (frame: RTCEncodedVideoFrame | RTCEncodedAudioFrame, controller: TransformStreamDefaultController) => {
          try {
            if (!symmetricKey) return // drop — key not ready
            if (!frame.data || frame.data.byteLength === 0) {
              return controller.enqueue(frame)
            }

            const unencryptedBytes = getUnencryptedBytes(frame)

            if (operation === 'encode') {
              // ── Encrypt ──
              const frameHeader = new Uint8Array(frame.data, 0, unencryptedBytes)
              const payload = new Uint8Array(frame.data, unencryptedBytes)

              const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES) // 24 bytes
              const ciphertext = sodium.crypto_secretbox_easy(payload, nonce, symmetricKey)

              // Trailer: [NONCE_LENGTH][KEY_INDEX]
              const trailer = new Uint8Array(2)
              trailer[0] = sodium.crypto_secretbox_NONCEBYTES // 24
              trailer[1] = KEY_INDEX

              // [header][ciphertext + MAC][nonce][trailer]
              const newData = new Uint8Array(
                frameHeader.byteLength + ciphertext.byteLength + nonce.byteLength + trailer.byteLength,
              )
              let offset = 0
              newData.set(frameHeader, offset); offset += frameHeader.byteLength
              newData.set(ciphertext, offset); offset += ciphertext.byteLength
              newData.set(nonce, offset); offset += nonce.byteLength
              newData.set(trailer, offset)

              frame.data = newData.buffer
              controller.enqueue(frame)
            } else {
              // ── Decrypt ──
              const frameHeader = new Uint8Array(frame.data, 0, unencryptedBytes)

              // Read trailer (last 2 bytes)
              const trailer = new Uint8Array(frame.data, frame.data.byteLength - 2, 2)
              const nonceLength = trailer[0]

              // Extract nonce
              const nonce = new Uint8Array(
                frame.data,
                frame.data.byteLength - nonceLength - trailer.byteLength,
                nonceLength,
              )

              // Extract ciphertext (between header and nonce)
              const ciphertextStart = frameHeader.byteLength
              const ciphertextLength = frame.data.byteLength - frameHeader.byteLength - nonceLength - trailer.byteLength
              const ciphertext = new Uint8Array(frame.data, ciphertextStart, ciphertextLength)

              const plaintext = sodium.crypto_secretbox_open_easy(ciphertext, nonce, symmetricKey)

              // Reconstruct: [header][plaintext]
              const newData = new Uint8Array(frameHeader.byteLength + plaintext.byteLength)
              newData.set(frameHeader)
              newData.set(plaintext, frameHeader.byteLength)
              frame.data = newData.buffer

              controller.enqueue(frame)
            }

            frameCount++
            if (frameCount <= 5 || frameCount % 500 === 0) {
              console.log(`[Worker] ${operation} frame #${frameCount} for ${participantIdentity}, ${frame.data.byteLength}B`)
            }
          } catch (e) {
            // Swallow to keep pipe alive
            if (frameCount < 10) {
              console.error(`[Worker] ${operation} error for ${participantIdentity}:`, (e as Error)?.message)
            }
          }
        },
      })

      readableStream
        .pipeThrough(transformStream)
        .pipeTo(writableStream)
        .then(() => console.warn(`[Worker] pipe completed for ${participantIdentity}/${trackId}`))
        .catch((err: Error) => console.warn(`[Worker] pipe error for ${participantIdentity}/${trackId}:`, err?.message))

      break
    }

    case 'enable':
      postMessage({
        kind: 'enable',
        data: { enabled: data.enabled, participantIdentity: data.participantIdentity },
      })
      break

    case 'removeTransform':
    case 'setRTPMap':
    case 'setSifTrailer':
    case 'updateCodec':
    case 'ratchetRequest':
      break
  }
}
