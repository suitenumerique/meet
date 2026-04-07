/**
 * E2EE Worker using libsodium XChaCha20-Poly1305.
 * Mirrors the structure of LiveKit's e2ee.worker but with libsodium crypto.
 * Receives encoded streams via transfer and pipes them with encrypt/decrypt transforms.
 */
import _sodium from 'libsodium-wrappers-sumo'

let sodium: typeof _sodium
let symmetricKey: Uint8Array | null = null

const transforms = new Map<string, { cancel: () => void }>()

async function init() {
  await _sodium.ready
  sodium = _sodium
}

const sodiumReady = init()

function encrypt(plaintext: Uint8Array): Uint8Array {
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)
  const ciphertext = sodium.crypto_secretbox_easy(plaintext, nonce, symmetricKey!)
  const result = new Uint8Array(nonce.length + ciphertext.length)
  result.set(nonce)
  result.set(ciphertext, nonce.length)
  return result
}

function decrypt(data: Uint8Array): Uint8Array {
  const nonce = data.slice(0, sodium.crypto_secretbox_NONCEBYTES)
  const ciphertext = data.slice(sodium.crypto_secretbox_NONCEBYTES)
  return sodium.crypto_secretbox_open_easy(ciphertext, nonce, symmetricKey!)
}

onmessage = async (ev: MessageEvent) => {
  const { kind, data } = ev.data

  switch (kind) {
    case 'init':
      await sodiumReady
      postMessage({ kind: 'initAck', data: { enabled: true } })
      break

    case 'setKey':
      symmetricKey = data.key
      // Echo back enable for the participant
      postMessage({
        kind: 'enable',
        data: { enabled: true, participantIdentity: data.participantIdentity },
      })
      break

    case 'encode':
    case 'decode': {
      await sodiumReady
      const { readableStream, writableStream, trackId, participantIdentity } = data
      const operation = kind === 'encode' ? 'encrypt' : 'decrypt'

      // Cancel existing transform for this track if any
      const existing = transforms.get(trackId)
      if (existing) existing.cancel()

      const abortController = new AbortController()

      const transformStream = new TransformStream({
        transform: async (frame: RTCEncodedVideoFrame, controller: TransformStreamDefaultController) => {
          if (!symmetricKey || frame.data.byteLength === 0) {
            return controller.enqueue(frame)
          }
          try {
            const input = new Uint8Array(frame.data)
            const output = operation === 'encrypt' ? encrypt(input) : decrypt(input)
            frame.data = output.buffer
            controller.enqueue(frame)
          } catch (e) {
            // Encrypt: drop frame (never send unencrypted)
            // Decrypt: emit error
            if (operation === 'decrypt') {
              postMessage({
                kind: 'error',
                data: {
                  error: new Error(`Decryption failed for ${participantIdentity}`),
                  participantIdentity,
                },
              })
            }
          }
        },
      })

      readableStream
        .pipeThrough(transformStream, { signal: abortController.signal })
        .pipeTo(writableStream)
        .catch(() => {})

      transforms.set(trackId, { cancel: () => abortController.abort() })
      break
    }

    case 'removeTransform':
      // Do NOT cancel the pipe. The transferred streams stay open across track
      // changes on reused receivers. The existing pipe will process frames from
      // the new track. Cancelling would kill the pipe permanently since
      // createEncodedStreams() can only be called once per receiver.
      break

    case 'enable':
      // Echo back
      postMessage({
        kind: 'enable',
        data: { enabled: data.enabled, participantIdentity: data.participantIdentity },
      })
      break

    case 'setRTPMap':
    case 'setSifTrailer':
    case 'updateCodec':
    case 'ratchetRequest':
      // Not needed for libsodium — ignore
      break
  }
}
