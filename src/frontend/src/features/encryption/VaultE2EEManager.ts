/**
 * E2EE Manager using VaultClient iframe for crypto.
 * Preserves codec header bytes unencrypted (required for RTP packetization).
 * TransformStream runs on main thread, crypto delegated to vault iframe.
 */
import { EventEmitter } from 'events'
import { Encryption_Type } from '@livekit/protocol'
import type { Room, RemoteTrack, Track } from 'livekit-client'
import {
  RoomEvent,
  ParticipantEvent,
  ConnectionState,
} from 'livekit-client'
import type { RTCEngine } from 'livekit-client/src/room/RTCEngine'

const E2EE_FLAG = Symbol('e2ee')

enum EncryptionEvent {
  ParticipantEncryptionStatusChanged = 'participantEncryptionStatusChanged',
  EncryptionError = 'encryptionError',
}

// VP8 unencrypted header bytes (same as LiveKit FrameCryptor)
const UNENCRYPTED_BYTES = { key: 10, delta: 3, audio: 1 }

function getUnencryptedBytes(frame: RTCEncodedVideoFrame | RTCEncodedAudioFrame): number {
  if (!('type' in frame)) return UNENCRYPTED_BYTES.audio
  return frame.type === 'key' ? UNENCRYPTED_BYTES.key : UNENCRYPTED_BYTES.delta
}

export class VaultE2EEManager extends EventEmitter {
  private vaultClient: VaultClient
  private room?: Room
  private encryptionEnabled = false
  private _isDataChannelEncryptionEnabled = false
  private encryptedKeyBytes: Uint8Array | null = null

  constructor(vaultClient: VaultClient) {
    super()
    this.vaultClient = vaultClient
  }

  get isEnabled() { return this.encryptionEnabled }

  get isDataChannelEncryptionEnabled() {
    return this.isEnabled && this._isDataChannelEncryptionEnabled
  }
  set isDataChannelEncryptionEnabled(enabled: boolean) {
    this._isDataChannelEncryptionEnabled = enabled
  }

  private freshKeyBuffer(): ArrayBuffer {
    return new Uint8Array(this.encryptedKeyBytes!).buffer
  }

  setEncryptedSymmetricKey(key: ArrayBuffer): void {
    this.encryptedKeyBytes = new Uint8Array(new Uint8Array(key))
  }

  setup(room: Room): void {
    if (room !== this.room) {
      this.room = room
      this.setupEventListeners(room)
    }
  }

  setupEngine(_engine: RTCEngine): void {}

  setParticipantCryptorEnabled(enabled: boolean, participantIdentity: string): void {
    if (
      participantIdentity === this.room?.localParticipant.identity &&
      this.encryptionEnabled !== enabled
    ) {
      this.encryptionEnabled = enabled
      this.emit(EncryptionEvent.ParticipantEncryptionStatusChanged, enabled, this.room!.localParticipant)
    } else if (participantIdentity !== this.room?.localParticipant.identity) {
      const p = this.room?.getParticipantByIdentity(participantIdentity)
      if (p) this.emit(EncryptionEvent.ParticipantEncryptionStatusChanged, enabled, p)
    }
  }

  setSifTrailer(_trailer: Uint8Array): void {}

  async encryptData(data: Uint8Array) {
    if (!this.encryptedKeyBytes) throw new Error('No key')
    const r = await this.vaultClient.encryptWithKey(data.slice().buffer, this.freshKeyBuffer())
    return { uuid: crypto.randomUUID(), payload: new Uint8Array(r.encryptedData).slice(), iv: new Uint8Array(0), keyIndex: 0 }
  }

  async handleEncryptedData(payload: Uint8Array, _iv: Uint8Array, _id: string, _idx: number) {
    if (!this.encryptedKeyBytes) throw new Error('No key')
    const r = await this.vaultClient.decryptWithKey(payload.slice().buffer, this.freshKeyBuffer())
    return { uuid: crypto.randomUUID(), payload: new Uint8Array(r.data).slice() }
  }

  // ── Events (same as built-in E2EEManager) ───────────────────────────

  private setupEventListeners(room: Room): void {
    room.on(RoomEvent.TrackPublished, (pub, participant) => {
      this.setParticipantCryptorEnabled(
        pub.trackInfo!.encryption !== Encryption_Type.NONE, participant.identity)
    })

    room.on(RoomEvent.ConnectionStateChanged, (state) => {
      if (state === ConnectionState.Connected) {
        room.remoteParticipants.forEach((p) => {
          p.trackPublications.forEach((pub) => {
            this.setParticipantCryptorEnabled(
              pub.trackInfo!.encryption !== Encryption_Type.NONE, p.identity)
          })
        })
      }
    })

    room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
      this.setupReceiver(track, participant.identity)
    })

    room.on(RoomEvent.SignalConnected, () => {
      this.setParticipantCryptorEnabled(
        room.localParticipant.isE2EEEnabled, room.localParticipant.identity)
    })

    room.localParticipant.on(
      ParticipantEvent.LocalSenderCreated,
      (sender: RTCRtpSender, track: Track) => {
        this.setupSender(sender, track.mediaStreamID)
      },
    )
  }

  // ── Sender ──────────────────────────────────────────────────────────

  private setupSender(sender: RTCRtpSender, _trackId: string): void {
    if (E2EE_FLAG in sender) return
    if (!this.room?.localParticipant.identity) return

    // @ts-expect-error
    const streams = sender.createEncodedStreams()

    const transformStream = new TransformStream({
      transform: async (frame: RTCEncodedVideoFrame | RTCEncodedAudioFrame, controller: TransformStreamDefaultController) => {
        try {
          if (!this.encryptedKeyBytes || !frame.data || frame.data.byteLength === 0) {
            return controller.enqueue(frame)
          }

          const unencryptedBytes = getUnencryptedBytes(frame)
          const header = new Uint8Array(frame.data, 0, unencryptedBytes)
          const payload = new Uint8Array(frame.data, unencryptedBytes)

          // Vault encrypts payload → returns [nonce][ciphertext+MAC]
          const { encryptedData } = await this.vaultClient.encryptWithKey(
            payload.slice().buffer,
            this.freshKeyBuffer(),
          )
          const encrypted = new Uint8Array(encryptedData)

          // Frame: [header][encrypted payload]
          const newData = new Uint8Array(header.byteLength + encrypted.byteLength)
          newData.set(header)
          newData.set(encrypted, header.byteLength)
          frame.data = newData.buffer

          controller.enqueue(frame)
        } catch {
          // Drop — never send unencrypted
        }
      },
    })

    streams.readable.pipeThrough(transformStream).pipeTo(streams.writable)
    // @ts-expect-error
    sender[E2EE_FLAG] = true
  }

  // ── Receiver ────────────────────────────────────────────────────────

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
      transform: async (frame: RTCEncodedVideoFrame | RTCEncodedAudioFrame, controller: TransformStreamDefaultController) => {
        try {
          if (!this.encryptedKeyBytes || !frame.data || frame.data.byteLength === 0) {
            return controller.enqueue(frame)
          }

          const unencryptedBytes = getUnencryptedBytes(frame)
          const header = new Uint8Array(frame.data, 0, unencryptedBytes)
          const encryptedPayload = new Uint8Array(frame.data, unencryptedBytes)

          // Vault decrypts [nonce][ciphertext+MAC] → plaintext
          const { data } = await this.vaultClient.decryptWithKey(
            encryptedPayload.slice().buffer,
            this.freshKeyBuffer(),
          )
          const plaintext = new Uint8Array(data)

          // Frame: [header][plaintext]
          const newData = new Uint8Array(header.byteLength + plaintext.byteLength)
          newData.set(header)
          newData.set(plaintext, header.byteLength)
          frame.data = newData.buffer

          controller.enqueue(frame)

          if (!successEmitted) {
            successEmitted = true
            const p = this.room?.getParticipantByIdentity(participantIdentity)
            if (p) this.emit(EncryptionEvent.ParticipantEncryptionStatusChanged, true, p)
          }
        } catch {
          // Drop frame on decrypt error — keeps pipe alive
        }
      },
    })

    readable.pipeThrough(transformStream).pipeTo(writable).catch(() => {})
    // @ts-expect-error
    receiver[E2EE_FLAG] = true
  }
}
