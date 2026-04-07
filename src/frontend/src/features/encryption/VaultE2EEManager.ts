/**
 * Custom E2EE Manager that delegates crypto to the VaultClient iframe.
 *
 * Uses XChaCha20-Poly1305 (libsodium) via the vault — the symmetric key
 * never leaves the iframe. Preserves codec header bytes unencrypted so
 * the WebRTC RTP packetizer can construct valid packets.
 *
 * Frame format (sender output / receiver input):
 *   [unencrypted codec header][vault-encrypted payload]
 *
 * Where vault-encrypted payload = [24B nonce][ciphertext + 16B Poly1305 MAC]
 *
 * Unencrypted header sizes (VP8):
 *   - keyframe: 10 bytes (VP8 payload descriptor)
 *   - delta:     3 bytes
 *   - audio:     1 byte  (Opus TOC)
 */
import { EventEmitter } from 'events'
import { Encryption_Type } from '@livekit/protocol'
import type { Room, RemoteTrack, Track } from 'livekit-client'
import { RoomEvent, ParticipantEvent, ConnectionState } from 'livekit-client'
import type { RTCEngine } from 'livekit-client/src/room/RTCEngine'

const E2EE_FLAG = Symbol('e2ee')

enum EncryptionEvent {
  ParticipantEncryptionStatusChanged = 'participantEncryptionStatusChanged',
  EncryptionError = 'encryptionError',
}

function isInsertableStreamSupported(): boolean {
  return (
    typeof window.RTCRtpSender !== 'undefined' &&
    // @ts-expect-error — createEncodedStreams not in TS types
    typeof window.RTCRtpSender.prototype.createEncodedStreams !== 'undefined'
  )
}

const UNENCRYPTED_BYTES = { key: 10, delta: 3, audio: 1 }

function getUnencryptedBytes(
  frame: RTCEncodedVideoFrame | RTCEncodedAudioFrame
): number {
  if (!('type' in frame)) return UNENCRYPTED_BYTES.audio
  return frame.type === 'key' ? UNENCRYPTED_BYTES.key : UNENCRYPTED_BYTES.delta
}

export class VaultE2EEManager extends EventEmitter {
  private vaultClient: VaultClient
  private room?: Room
  private encryptionEnabled = false
  private _isDataChannelEncryptionEnabled = false

  /**
   * Encrypted symmetric key (wrapped for the user's vault public key).
   * Stored as an independent copy so the original ArrayBuffer can't be detached.
   */
  private encryptedKeyBytes: Uint8Array | null = null

  constructor(vaultClient: VaultClient) {
    super()
    this.vaultClient = vaultClient
  }

  get isEnabled() {
    return this.encryptionEnabled
  }

  get isDataChannelEncryptionEnabled() {
    return this._isDataChannelEncryptionEnabled && !!this.encryptedKeyBytes
  }

  set isDataChannelEncryptionEnabled(enabled: boolean) {
    this._isDataChannelEncryptionEnabled = enabled
  }

  /** Fresh ArrayBuffer copy of the key for each vault call (avoids postMessage detachment). */
  private freshKeyBuffer(): ArrayBuffer {
    return new Uint8Array(this.encryptedKeyBytes!).buffer
  }

  setEncryptedSymmetricKey(key: ArrayBuffer): void {
    this.encryptedKeyBytes = new Uint8Array(new Uint8Array(key))
  }

  // ── Lifecycle (mirrors built-in E2EEManager) ────────────────────────

  setup(room: Room): void {
    if (!isInsertableStreamSupported()) {
      throw new Error(
        'End-to-end encryption is not supported in this browser. ' +
        'Please use a Chromium-based browser (Chrome, Edge, Brave).'
      )
    }
    if (room !== this.room) {
      this.room = room
      this.setupEventListeners(room)
    }
  }

  setupEngine(_engine: RTCEngine): void {}

  setParticipantCryptorEnabled(
    enabled: boolean,
    participantIdentity: string
  ): void {
    if (
      participantIdentity === this.room?.localParticipant.identity &&
      this.encryptionEnabled !== enabled
    ) {
      this.encryptionEnabled = enabled
      this.emit(
        EncryptionEvent.ParticipantEncryptionStatusChanged,
        enabled,
        this.room!.localParticipant
      )
    } else if (participantIdentity !== this.room?.localParticipant.identity) {
      const p = this.room?.getParticipantByIdentity(participantIdentity)
      if (p)
        this.emit(
          EncryptionEvent.ParticipantEncryptionStatusChanged,
          enabled,
          p
        )
    }
  }

  setSifTrailer(_trailer: Uint8Array): void {}

  async encryptData(data: Uint8Array) {
    if (!this.encryptedKeyBytes)
      throw new Error('No encrypted symmetric key set')
    const r = await this.vaultClient.encryptWithKey(
      data.slice().buffer,
      this.freshKeyBuffer()
    )
    return {
      uuid: crypto.randomUUID(),
      payload: new Uint8Array(r.encryptedData).slice(),
      iv: new Uint8Array(0),
      keyIndex: 0,
    }
  }

  async handleEncryptedData(
    payload: Uint8Array,
    _iv: Uint8Array,
    _participantIdentity: string,
    _keyIndex: number
  ) {
    if (!this.encryptedKeyBytes)
      throw new Error('No encrypted symmetric key set')
    const r = await this.vaultClient.decryptWithKey(
      payload.slice().buffer,
      this.freshKeyBuffer()
    )
    return {
      uuid: crypto.randomUUID(),
      payload: new Uint8Array(r.data).slice(),
    }
  }

  // ── Event listeners ─────────────────────────────────────────────────

  private setupEventListeners(room: Room): void {
    room.on(RoomEvent.TrackPublished, (pub, participant) => {
      this.setParticipantCryptorEnabled(
        pub.trackInfo!.encryption !== Encryption_Type.NONE,
        participant.identity
      )
    })

    room.on(RoomEvent.ConnectionStateChanged, (state) => {
      if (state === ConnectionState.Connected) {
        room.remoteParticipants.forEach((p) => {
          p.trackPublications.forEach((pub) => {
            this.setParticipantCryptorEnabled(
              pub.trackInfo!.encryption !== Encryption_Type.NONE,
              p.identity
            )
          })
        })
      }
    })

    room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
      this.setupReceiver(track, participant.identity)
    })

    room.on(RoomEvent.SignalConnected, () => {
      this.setParticipantCryptorEnabled(
        room.localParticipant.isE2EEEnabled,
        room.localParticipant.identity
      )
    })

    room.localParticipant.on(
      ParticipantEvent.LocalSenderCreated,
      (sender: RTCRtpSender, track: Track) => {
        this.setupSender(sender, track.mediaStreamID)
      }
    )
  }

  // ── Sender (encrypt outgoing frames) ────────────────────────────────

  private setupSender(sender: RTCRtpSender, _trackId: string): void {
    if (E2EE_FLAG in sender) return
    if (!this.room?.localParticipant.identity) return

    // @ts-expect-error — createEncodedStreams not in TS types
    const streams = sender.createEncodedStreams()

    const transformStream = new TransformStream({
      transform: async (
        frame: RTCEncodedVideoFrame | RTCEncodedAudioFrame,
        controller: TransformStreamDefaultController
      ) => {
        try {
          if (!this.encryptedKeyBytes) return // drop — never send unencrypted
          if (!frame.data || frame.data.byteLength === 0)
            return controller.enqueue(frame)

          const unencryptedBytes = getUnencryptedBytes(frame)
          const header = new Uint8Array(frame.data, 0, unencryptedBytes)
          const payload = new Uint8Array(frame.data, unencryptedBytes)

          const { encryptedData } = await this.vaultClient.encryptWithKey(
            payload.slice().buffer,
            this.freshKeyBuffer()
          )

          const encrypted = new Uint8Array(encryptedData)
          const newData = new Uint8Array(
            header.byteLength + encrypted.byteLength
          )
          newData.set(header)
          newData.set(encrypted, header.byteLength)
          frame.data = newData.buffer
          controller.enqueue(frame)
        } catch {
          // Drop frame on error — never send unencrypted
        }
      },
    })

    streams.readable.pipeThrough(transformStream).pipeTo(streams.writable)
    // @ts-expect-error
    sender[E2EE_FLAG] = true
  }

  // ── Receiver (decrypt incoming frames) ──────────────────────────────

  private setupReceiver(track: RemoteTrack, participantIdentity: string): void {
    if (!track.receiver) return
    const receiver = track.receiver
    if (E2EE_FLAG in receiver) return

    // @ts-expect-error
    let writable: WritableStream = receiver.writableStream
    // @ts-expect-error
    let readable: ReadableStream = receiver.readableStream

    if (!writable || !readable) {
      // @ts-expect-error
      const streams = receiver.createEncodedStreams()
      // @ts-expect-error
      receiver.writableStream = streams.writable
      writable = streams.writable
      // @ts-expect-error
      receiver.readableStream = streams.readable
      readable = streams.readable
    }

    let successEmitted = false

    const transformStream = new TransformStream({
      transform: async (
        frame: RTCEncodedVideoFrame | RTCEncodedAudioFrame,
        controller: TransformStreamDefaultController
      ) => {
        try {
          if (!this.encryptedKeyBytes) return // drop — can't decrypt without key
          if (!frame.data || frame.data.byteLength === 0)
            return controller.enqueue(frame)

          const unencryptedBytes = getUnencryptedBytes(frame)
          const header = new Uint8Array(frame.data, 0, unencryptedBytes)
          const encryptedPayload = new Uint8Array(frame.data, unencryptedBytes)

          const { data } = await this.vaultClient.decryptWithKey(
            encryptedPayload.slice().buffer,
            this.freshKeyBuffer()
          )

          const plaintext = new Uint8Array(data)
          const newData = new Uint8Array(
            header.byteLength + plaintext.byteLength
          )
          newData.set(header)
          newData.set(plaintext, header.byteLength)
          frame.data = newData.buffer
          controller.enqueue(frame)

          if (!successEmitted) {
            successEmitted = true
            const p = this.room?.getParticipantByIdentity(participantIdentity)
            if (p)
              this.emit(
                EncryptionEvent.ParticipantEncryptionStatusChanged,
                true,
                p
              )
          }
        } catch {
          // Drop frame — keeps pipe alive, avoids sending corrupt data to decoder
        }
      },
    })

    readable
      .pipeThrough(transformStream)
      .pipeTo(writable)
      .catch(() => {})
    // @ts-expect-error
    receiver[E2EE_FLAG] = true
  }
}
