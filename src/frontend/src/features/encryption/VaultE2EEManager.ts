/**
 * STEP 2b: E2EE Manager using a custom Worker with libsodium crypto.
 * Same architecture as the built-in (streams transferred to Worker), but
 * using XChaCha20-Poly1305 via libsodium instead of AES-GCM via crypto.subtle.
 *
 * This solves the receiver-reuse problem: transferred streams survive track
 * changes, so the pipe in the Worker keeps working when a participant refreshes.
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

// Hardcoded 32-byte key — same on all participants (Step 2)
const HARDCODED_KEY = new Uint8Array([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
  17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32,
])

export class VaultE2EEManager extends EventEmitter {
  private room?: Room
  private encryptionEnabled = false
  private _isDataChannelEncryptionEnabled = false
  private worker: Worker

  constructor(_vaultClient: VaultClient) {
    super()
    this.worker = new Worker(
      new URL('./vault-e2ee.worker.ts', import.meta.url),
      { type: 'module' },
    )
    this.worker.onmessage = this.onWorkerMessage
    this.worker.onerror = (ev) => {
      console.error('[VaultE2EE] worker error:', ev)
    }
    // Send init AND key immediately — key doesn't need sodium, so the Worker
    // can store it before WASM loads. This avoids the race where encode/decode
    // messages arrive before the key is set.
    this.worker.postMessage({ kind: 'init', data: {} })
    this.worker.postMessage({ kind: 'setKey', data: { key: HARDCODED_KEY, participantIdentity: '__init__' } })
  }

  get isEnabled() {
    return this.encryptionEnabled
  }

  get isDataChannelEncryptionEnabled() {
    return this.isEnabled && this._isDataChannelEncryptionEnabled
  }

  set isDataChannelEncryptionEnabled(enabled: boolean) {
    this._isDataChannelEncryptionEnabled = enabled
  }

  setEncryptedSymmetricKey(_key: ArrayBuffer): void {
    // No-op for Step 2 — using hardcoded key
  }

  setup(room: Room): void {
    if (room !== this.room) {
      this.room = room
      this.setupEventListeners(room)
    }
  }

  setupEngine(_engine: RTCEngine): void {}

  setParticipantCryptorEnabled(enabled: boolean, participantIdentity: string): void {
    // Send key to worker when enabling
    if (enabled) {
      this.worker.postMessage({
        kind: 'setKey',
        data: { key: HARDCODED_KEY, participantIdentity },
      })
    }
    this.worker.postMessage({
      kind: 'enable',
      data: { enabled, participantIdentity },
    })
  }

  setSifTrailer(_trailer: Uint8Array): void {}

  async encryptData(_data: Uint8Array) {
    return { uuid: crypto.randomUUID(), payload: _data, iv: new Uint8Array(0), keyIndex: 0 }
  }

  async handleEncryptedData(payload: Uint8Array) {
    return { uuid: crypto.randomUUID(), payload }
  }

  // ── Worker messages ─────────────────────────────────────────────────

  private onWorkerMessage = (ev: MessageEvent) => {
    const { kind, data } = ev.data
    switch (kind) {
      case 'initAck':
        console.info('[VaultE2EE] STEP 2b: Worker ready (libsodium)')
        break

      case 'enable':
        if (
          this.encryptionEnabled !== data.enabled &&
          data.participantIdentity === this.room?.localParticipant.identity
        ) {
          this.encryptionEnabled = data.enabled
          this.emit(EncryptionEvent.ParticipantEncryptionStatusChanged, data.enabled, this.room!.localParticipant)
        } else if (data.participantIdentity && data.participantIdentity !== '__init__') {
          const p = this.room?.getParticipantByIdentity(data.participantIdentity)
          if (p) this.emit(EncryptionEvent.ParticipantEncryptionStatusChanged, data.enabled, p)
        }
        break

      case 'error':
        this.emit(EncryptionEvent.EncryptionError, data.error, data.participantIdentity)
        break
    }
  }

  // ── Event listeners (same as built-in) ──────────────────────────────

  private setupEventListeners(room: Room): void {
    room.on(RoomEvent.TrackPublished, (pub, participant) => {
      this.setParticipantCryptorEnabled(
        pub.trackInfo!.encryption !== Encryption_Type.NONE,
        participant.identity,
      )
    })

    room.on(RoomEvent.ConnectionStateChanged, (state) => {
      if (state === ConnectionState.Connected) {
        room.remoteParticipants.forEach((participant) => {
          participant.trackPublications.forEach((pub) => {
            this.setParticipantCryptorEnabled(
              pub.trackInfo!.encryption !== Encryption_Type.NONE,
              participant.identity,
            )
          })
        })
      }
    })

    room.on(RoomEvent.TrackUnsubscribed, (track, _, participant) => {
      this.worker.postMessage({
        kind: 'removeTransform',
        data: { participantIdentity: participant.identity, trackId: track.mediaStreamID },
      })
    })

    room.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
      this.setupReceiver(track, participant.identity, pub.trackInfo)
    })

    room.on(RoomEvent.SignalConnected, () => {
      this.setParticipantCryptorEnabled(
        room.localParticipant.isE2EEEnabled,
        room.localParticipant.identity,
      )
    })

    room.localParticipant.on(
      ParticipantEvent.LocalSenderCreated,
      (sender: RTCRtpSender, track: Track) => {
        this.setupSender(sender, track.mediaStreamID)
      },
    )
  }

  // ── Sender/Receiver — streams transferred to Worker ─────────────────

  private setupSender(sender: RTCRtpSender, trackId: string): void {
    if (E2EE_FLAG in sender) return
    if (!this.room?.localParticipant.identity) return

    // @ts-expect-error
    const senderStreams = sender.createEncodedStreams()

    this.worker.postMessage(
      {
        kind: 'encode',
        data: {
          readableStream: senderStreams.readable,
          writableStream: senderStreams.writable,
          trackId,
          participantIdentity: this.room.localParticipant.identity,
        },
      },
      [senderStreams.readable, senderStreams.writable],
    )

    // @ts-expect-error
    sender[E2EE_FLAG] = true
  }

  private setupReceiver(track: RemoteTrack, participantIdentity: string, trackInfo?: { mimeType?: string }): void {
    if (!track.receiver) return
    const receiver = track.receiver

    if (E2EE_FLAG in receiver) {
      // Receiver reuse — Worker's existing pipe handles new track frames
      this.worker.postMessage({
        kind: 'updateCodec',
        data: {
          trackId: track.mediaStreamID,
          participantIdentity,
          codec: trackInfo?.mimeType?.split('/')[1],
        },
      })
      return
    }

    // @ts-expect-error
    let writable: WritableStream = receiver.writableStream
    // @ts-expect-error
    let readable: ReadableStream = receiver.readableStream

    if (!writable || !readable) {
      // @ts-expect-error
      const receiverStreams = receiver.createEncodedStreams()
      // @ts-expect-error
      receiver.writableStream = receiverStreams.writable
      writable = receiverStreams.writable
      // @ts-expect-error
      receiver.readableStream = receiverStreams.readable
      readable = receiverStreams.readable
    }

    this.worker.postMessage(
      {
        kind: 'decode',
        data: {
          readableStream: readable,
          writableStream: writable,
          trackId: track.mediaStreamID,
          participantIdentity,
          codec: trackInfo?.mimeType?.split('/')[1],
          isReuse: false,
        },
      },
      [readable, writable],
    )

    // @ts-expect-error
    receiver[E2EE_FLAG] = true
  }
}
