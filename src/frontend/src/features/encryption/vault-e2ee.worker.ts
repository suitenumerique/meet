/**
 * E2EE Worker — Step 2d: uses crypto.subtle AES-GCM with the SAME frame format
 * as LiveKit's built-in FrameCryptor, including preserved unencrypted header bytes.
 *
 * Frame format (same as LiveKit):
 *   [unencrypted header][ciphertext + GCM tag][IV (12B)][IV_LENGTH (1B)][key index (1B)]
 *
 * Unencrypted header sizes (VP8):
 *   - keyframe: 10 bytes
 *   - delta: 3 bytes
 *   - audio: 1 byte (Opus TOC)
 */

let encryptionKey: CryptoKey | null = null
const IV_LENGTH = 12
const KEY_INDEX = 0

// Same constants as LiveKit's FrameCryptor
const UNENCRYPTED_BYTES = {
  key: 10,    // VP8 keyframe
  delta: 3,   // VP8 delta frame
  audio: 1,   // Opus TOC byte
}

function getUnencryptedBytes(frame: RTCEncodedVideoFrame | RTCEncodedAudioFrame): number {
  // Audio frames don't have .type
  if (!('type' in frame)) {
    return UNENCRYPTED_BYTES.audio
  }
  return frame.type === 'key' ? UNENCRYPTED_BYTES.key : UNENCRYPTED_BYTES.delta
}

function makeIV(ssrc: number, timestamp: number): Uint8Array {
  const iv = new ArrayBuffer(IV_LENGTH)
  const view = new DataView(iv)
  view.setUint32(0, ssrc, true)
  view.setUint32(4, timestamp, true)
  view.setUint32(8, ssrc ^ timestamp, true)
  return new Uint8Array(iv)
}

onmessage = async (ev: MessageEvent) => {
  const { kind, data } = ev.data

  switch (kind) {
    case 'init':
      postMessage({ kind: 'initAck', data: { enabled: true } })
      break

    case 'setKey': {
      encryptionKey = await crypto.subtle.importKey(
        'raw', data.key, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
      )
      postMessage({
        kind: 'enable',
        data: { enabled: true, participantIdentity: data.participantIdentity },
      })
      break
    }

    case 'encode':
    case 'decode': {
      const { readableStream, writableStream, trackId, participantIdentity } = data
      const operation = kind
      let frameCount = 0

      const transformStream = new TransformStream({
        transform: async (frame: RTCEncodedVideoFrame | RTCEncodedAudioFrame, controller: TransformStreamDefaultController) => {
          try {
            if (!encryptionKey) return // drop — key not ready
            if (!frame.data || frame.data.byteLength === 0) {
              return controller.enqueue(frame)
            }

            if (operation === 'encode') {
              // ── Encrypt (same as LiveKit FrameCryptor.encodeFunction) ──
              const iv = makeIV(
                (frame as any).getMetadata?.().synchronizationSource ?? 0,
                (frame as any).timestamp ?? 0,
              )

              const unencryptedBytes = getUnencryptedBytes(frame)
              const frameHeader = new Uint8Array(frame.data, 0, unencryptedBytes)

              const ciphertext = await crypto.subtle.encrypt(
                {
                  name: 'AES-GCM',
                  iv,
                  additionalData: new Uint8Array(frame.data, 0, frameHeader.byteLength),
                },
                encryptionKey,
                new Uint8Array(frame.data, unencryptedBytes),
              )

              // [header][ciphertext+tag][IV][IV_LENGTH][keyIndex]
              const frameTrailer = new Uint8Array(2)
              frameTrailer[0] = IV_LENGTH
              frameTrailer[1] = KEY_INDEX

              const newData = new Uint8Array(
                frameHeader.byteLength + ciphertext.byteLength + iv.byteLength + frameTrailer.byteLength,
              )
              newData.set(frameHeader)
              newData.set(new Uint8Array(ciphertext), frameHeader.byteLength)
              newData.set(iv, frameHeader.byteLength + ciphertext.byteLength)
              newData.set(frameTrailer, frameHeader.byteLength + ciphertext.byteLength + iv.byteLength)

              frame.data = newData.buffer
              controller.enqueue(frame)
            } else {
              // ── Decrypt (same as LiveKit FrameCryptor.decodeFunction) ──
              const frameData = new Uint8Array(frame.data)
              const unencryptedBytes = getUnencryptedBytes(frame)
              const frameHeader = new Uint8Array(frame.data, 0, unencryptedBytes)

              // Read trailer
              const frameTrailer = new Uint8Array(frame.data, frame.data.byteLength - 2, 2)
              const ivLength = frameTrailer[0]

              // Extract IV
              const iv = new Uint8Array(
                frame.data,
                frame.data.byteLength - ivLength - frameTrailer.byteLength,
                ivLength,
              )

              // Extract ciphertext (between header and IV)
              const ciphertextStart = frameHeader.byteLength
              const ciphertextLength = frame.data.byteLength - frameHeader.byteLength - ivLength - frameTrailer.byteLength

              const plaintext = await crypto.subtle.decrypt(
                {
                  name: 'AES-GCM',
                  iv,
                  additionalData: new Uint8Array(frame.data, 0, frameHeader.byteLength),
                },
                encryptionKey,
                new Uint8Array(frame.data, ciphertextStart, ciphertextLength),
              )

              // Reconstruct: [header][plaintext]
              const newData = new Uint8Array(frameHeader.byteLength + plaintext.byteLength)
              newData.set(frameHeader)
              newData.set(new Uint8Array(plaintext), frameHeader.byteLength)
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
