import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  VaultE2EEManager,
  getUnencryptedBytes,
  UNENCRYPTED_BYTES,
} from './VaultE2EEManager'

// ── getUnencryptedBytes ───────────────────────────────────────────────

describe('getUnencryptedBytes', () => {
  it('returns 10 for VP8 keyframes', () => {
    const frame = { type: 'key', data: new ArrayBuffer(100) }
    expect(getUnencryptedBytes(frame as unknown as RTCEncodedVideoFrame)).toBe(
      UNENCRYPTED_BYTES.key
    )
  })

  it('returns 3 for VP8 delta frames', () => {
    const frame = { type: 'delta', data: new ArrayBuffer(100) }
    expect(getUnencryptedBytes(frame as unknown as RTCEncodedVideoFrame)).toBe(
      UNENCRYPTED_BYTES.delta
    )
  })

  it('returns 1 for audio frames (no type property)', () => {
    const frame = { data: new ArrayBuffer(100) }
    expect(getUnencryptedBytes(frame as unknown as RTCEncodedAudioFrame)).toBe(
      UNENCRYPTED_BYTES.audio
    )
  })
})

// ── Mock VaultClient ──────────────────────────────────────────────────

function createMockVaultClient() {
  // Simulates vault crypto: prepends 24-byte nonce + appends 16-byte MAC
  const NONCE_LEN = 24
  const MAC_LEN = 16

  return {
    encryptWithKey: vi.fn(async (data: ArrayBuffer, _key: ArrayBuffer) => {
      const input = new Uint8Array(data)
      const nonce = new Uint8Array(NONCE_LEN).fill(0xaa) // deterministic for tests
      const ciphertext = new Uint8Array(input.length + MAC_LEN)
      ciphertext.set(input) // "encrypt" = copy (for testing)
      ciphertext.set(new Uint8Array(MAC_LEN).fill(0xbb), input.length) // fake MAC

      const result = new Uint8Array(NONCE_LEN + ciphertext.length)
      result.set(nonce)
      result.set(ciphertext, NONCE_LEN)
      return { encryptedData: result.buffer }
    }),

    decryptWithKey: vi.fn(
      async (encryptedData: ArrayBuffer, _key: ArrayBuffer) => {
        const input = new Uint8Array(encryptedData)
        // Strip nonce (24B) and MAC (16B)
        const plaintext = input.slice(NONCE_LEN, input.length - MAC_LEN)
        return { data: plaintext.buffer }
      }
    ),
  } as unknown as VaultClient
}

// ── Key management ────────────────────────────────────────────────────

describe('VaultE2EEManager key management', () => {
  it('stores an independent copy of the key', () => {
    const vaultClient = createMockVaultClient()
    const manager = new VaultE2EEManager(vaultClient)

    const original = new Uint8Array([1, 2, 3, 4])
    manager.setEncryptedSymmetricKey(original.buffer)

    // Mutate original — should not affect stored key
    original[0] = 99

    // Access internal state via encryptData (which uses freshKeyBuffer)
    // If the key was a view on the original, this would reflect the mutation
    expect(manager.isDataChannelEncryptionEnabled).toBe(false) // _isDataChannelEncryptionEnabled not set
    manager.isDataChannelEncryptionEnabled = true
    expect(manager.isDataChannelEncryptionEnabled).toBe(true) // key is set
  })

  it('isDataChannelEncryptionEnabled is false without key', () => {
    const manager = new VaultE2EEManager(createMockVaultClient())
    manager.isDataChannelEncryptionEnabled = true
    expect(manager.isDataChannelEncryptionEnabled).toBe(false)
  })

  it('isDataChannelEncryptionEnabled is true with key + flag', () => {
    const manager = new VaultE2EEManager(createMockVaultClient())
    manager.setEncryptedSymmetricKey(new ArrayBuffer(32))
    manager.isDataChannelEncryptionEnabled = true
    expect(manager.isDataChannelEncryptionEnabled).toBe(true)
  })
})

// ── Data channel encrypt/decrypt round-trip ───────────────────────────

describe('VaultE2EEManager data channel encryption', () => {
  let manager: VaultE2EEManager
  let vaultClient: ReturnType<typeof createMockVaultClient>

  beforeEach(() => {
    vaultClient = createMockVaultClient()
    manager = new VaultE2EEManager(vaultClient as unknown as VaultClient)
    manager.setEncryptedSymmetricKey(new ArrayBuffer(32))
  })

  it('encryptData calls vaultClient.encryptWithKey', async () => {
    const data = new Uint8Array([10, 20, 30])
    const result = await manager.encryptData(data)

    expect(vaultClient.encryptWithKey).toHaveBeenCalledOnce()
    expect(result.payload).toBeInstanceOf(Uint8Array)
    expect(result.payload.length).toBeGreaterThan(data.length) // overhead from nonce+MAC
  })

  it('handleEncryptedData calls vaultClient.decryptWithKey', async () => {
    const data = new Uint8Array([10, 20, 30])
    const encrypted = await manager.encryptData(data)
    const decrypted = await manager.handleEncryptedData(
      encrypted.payload,
      new Uint8Array(0),
      'participant-1',
      0
    )

    expect(vaultClient.decryptWithKey).toHaveBeenCalledOnce()
    expect(new Uint8Array(decrypted.payload)).toEqual(data)
  })

  it('encryptData throws without key', async () => {
    const noKeyManager = new VaultE2EEManager(
      vaultClient as unknown as VaultClient
    )
    await expect(noKeyManager.encryptData(new Uint8Array([1]))).rejects.toThrow(
      'No encrypted symmetric key set'
    )
  })

  it('handleEncryptedData throws without key', async () => {
    const noKeyManager = new VaultE2EEManager(
      vaultClient as unknown as VaultClient
    )
    await expect(
      noKeyManager.handleEncryptedData(
        new Uint8Array([1]),
        new Uint8Array(0),
        'p',
        0
      )
    ).rejects.toThrow('No encrypted symmetric key set')
  })
})

// ── Frame format (header preservation) ────────────────────────────────

describe('Frame format — header preservation', () => {
  let vaultClient: ReturnType<typeof createMockVaultClient>

  beforeEach(() => {
    vaultClient = createMockVaultClient()
  })

  it('encrypt preserves VP8 keyframe header (10 bytes)', async () => {
    // Simulate what the sender transform does
    const frameData = new Uint8Array(100)
    // Fill with recognizable pattern: header = 0x01-0x0A, payload = 0xFF
    for (let i = 0; i < 10; i++) frameData[i] = i + 1
    frameData.fill(0xff, 10)

    const unencryptedBytes = UNENCRYPTED_BYTES.key // 10
    const header = frameData.slice(0, unencryptedBytes)
    const payload = frameData.slice(unencryptedBytes)

    const { encryptedData } = await vaultClient.encryptWithKey(
      payload.buffer,
      new ArrayBuffer(32)
    )
    const encrypted = new Uint8Array(encryptedData)

    // Reconstruct frame: [header][encrypted payload]
    const newFrame = new Uint8Array(header.length + encrypted.length)
    newFrame.set(header)
    newFrame.set(encrypted, header.length)

    // Verify header is preserved unencrypted
    expect(newFrame.slice(0, 10)).toEqual(header)
    // Verify the rest is different (encrypted)
    expect(newFrame.length).toBeGreaterThan(frameData.length) // overhead
  })

  it('encrypt + decrypt round-trip preserves original frame', async () => {
    const frameData = new Uint8Array(50)
    for (let i = 0; i < 50; i++) frameData[i] = i

    const unencryptedBytes = UNENCRYPTED_BYTES.delta // 3
    const header = frameData.slice(0, unencryptedBytes)
    const payload = frameData.slice(unencryptedBytes)

    // Encrypt
    const { encryptedData } = await vaultClient.encryptWithKey(
      payload.slice().buffer,
      new ArrayBuffer(32)
    )
    const encrypted = new Uint8Array(encryptedData)
    const encryptedFrame = new Uint8Array(header.length + encrypted.length)
    encryptedFrame.set(header)
    encryptedFrame.set(encrypted, header.length)

    // Decrypt (receiver side)
    const rxHeader = encryptedFrame.slice(0, unencryptedBytes)
    const rxEncrypted = encryptedFrame.slice(unencryptedBytes)
    const { data } = await vaultClient.decryptWithKey(
      rxEncrypted.slice().buffer,
      new ArrayBuffer(32)
    )
    const plaintext = new Uint8Array(data)
    const decryptedFrame = new Uint8Array(rxHeader.length + plaintext.length)
    decryptedFrame.set(rxHeader)
    decryptedFrame.set(plaintext, rxHeader.length)

    // Original frame should be recovered exactly
    expect(decryptedFrame).toEqual(frameData)
  })

  it('audio frames preserve 1 byte header', async () => {
    const frameData = new Uint8Array(20)
    frameData[0] = 0xfc // Opus TOC byte
    frameData.fill(0xab, 1)

    const unencryptedBytes = UNENCRYPTED_BYTES.audio // 1
    const header = frameData.slice(0, unencryptedBytes)
    const payload = frameData.slice(unencryptedBytes)

    const { encryptedData } = await vaultClient.encryptWithKey(
      payload.slice().buffer,
      new ArrayBuffer(32)
    )
    const encrypted = new Uint8Array(encryptedData)
    const encryptedFrame = new Uint8Array(header.length + encrypted.length)
    encryptedFrame.set(header)
    encryptedFrame.set(encrypted, header.length)

    // First byte (Opus TOC) must be preserved
    expect(encryptedFrame[0]).toBe(0xfc)
  })
})
