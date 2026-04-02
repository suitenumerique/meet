/**
 * Custom E2EE Manager that delegates crypto operations to the VaultClient iframe.
 *
 * Instead of using LiveKit's built-in Worker + FrameCryptor, this manager:
 * - Sets up insertable streams (createEncodedStreams) on senders/receivers
 * - Pipes frames through a TransformStream on the main thread
 * - Delegates encrypt/decrypt to VaultClient.encryptWithKey / decryptWithKey
 * - The symmetric key never leaves the VaultClient iframe
 *
 * Uses transferable ArrayBuffers for zero-copy performance.
 */
import { EventEmitter } from 'events'
import type { Room, RemoteTrack, Track } from 'livekit-client'
import {
  RoomEvent,
  ParticipantEvent,
  ConnectionState,
  Encryption_Type,
} from 'livekit-client'
import type { RTCEngine } from 'livekit-client/src/room/RTCEngine'

// Re-declare the interface types we need (not exported from livekit-client)
interface EncryptDataResponse {
  uuid: string
  payload: Uint8Array
  iv: Uint8Array
  keyIndex: number
}

interface DecryptDataResponse {
  uuid: string
  payload: Uint8Array
}

const E2EE_FLAG = Symbol('e2ee')

enum EncryptionEvent {
  ParticipantEncryptionStatusChanged = 'participantEncryptionStatusChanged',
  EncryptionError = 'encryptionError',
}

function isLocalTrack(track: Track): boolean {
  return (track as { sender?: RTCRtpSender }).sender !== undefined
}

export class VaultE2EEManager extends EventEmitter {
  private vaultClient: VaultClient
  private room?: Room
  private encryptionEnabled = false
  private _isDataChannelEncryptionEnabled = false

  /** The symmetric key encrypted for the current user's vault public key */
  private encryptedSymmetricKey: ArrayBuffer | null = null

  constructor(vaultClient: VaultClient) {
    super()
    this.vaultClient = vaultClient
  }

  get isEnabled(): boolean {
    return this.encryptionEnabled
  }

  get isDataChannelEncryptionEnabled(): boolean {
    return this.isEnabled && this._isDataChannelEncryptionEnabled
  }

  set isDataChannelEncryptionEnabled(enabled: boolean) {
    this._isDataChannelEncryptionEnabled = enabled
  }

  /**
   * Set the encrypted symmetric key (wrapped for this user's vault public key).
   * Must be called before encryption can work.
   */
  setEncryptedSymmetricKey(key: ArrayBuffer): void {
    this.encryptedSymmetricKey = key
  }

  setup(room: Room): void {
    if (room !== this.room) {
      this.room = room
      this.setupEventListeners(room)
    }
  }

  setupEngine(_engine: RTCEngine): void {
    // No RTP map tracking needed — VaultClient handles crypto opaquely
  }

  setParticipantCryptorEnabled(enabled: boolean, participantIdentity: string): void {
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
      const participant = this.room?.getParticipantByIdentity(participantIdentity)
      if (participant) {
        this.emit(EncryptionEvent.ParticipantEncryptionStatusChanged, enabled, participant)
      }
    }
  }

  setSifTrailer(_trailer: Uint8Array): void {
    // SIF (Server Injected Frames) not supported in vault mode
  }

  async encryptData(data: Uint8Array): Promise<EncryptDataResponse> {
    if (!this.encryptedSymmetricKey) {
      throw new Error('No encrypted symmetric key set')
    }

    const { encryptedData } = await this.vaultClient.encryptWithKey(
      data.buffer as ArrayBuffer,
      this.encryptedSymmetricKey
    )

    return {
      uuid: crypto.randomUUID(),
      payload: new Uint8Array(encryptedData),
      iv: new Uint8Array(0), // IV is embedded by VaultClient
      keyIndex: 0,
    }
  }

  async handleEncryptedData(
    payload: Uint8Array,
    _iv: Uint8Array,
    _participantIdentity: string,
    _keyIndex: number
  ): Promise<DecryptDataResponse> {
    if (!this.encryptedSymmetricKey) {
      throw new Error('No encrypted symmetric key set')
    }

    const { data } = await this.vaultClient.decryptWithKey(
      payload.buffer as ArrayBuffer,
      this.encryptedSymmetricKey
    )

    return {
      uuid: crypto.randomUUID(),
      payload: new Uint8Array(data),
    }
  }

  private setupEventListeners(room: Room): void {
    room.on(RoomEvent.TrackPublished, (pub, participant) => {
      this.setParticipantCryptorEnabled(
        pub.trackInfo!.encryption !== Encryption_Type.NONE,
        participant.identity
      )
    })

    room.on(RoomEvent.ConnectionStateChanged, (state) => {
      if (state === ConnectionState.Connected) {
        room.remoteParticipants.forEach((participant) => {
          participant.trackPublications.forEach((pub) => {
            this.setParticipantCryptorEnabled(
              pub.trackInfo!.encryption !== Encryption_Type.NONE,
              participant.identity
            )
          })
        })
      }
    })

    room.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
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

  private setupSender(sender: RTCRtpSender, trackId: string): void {
    if (E2EE_FLAG in sender) return
    if (!this.room?.localParticipant.identity) return

    // @ts-expect-error - createEncodedStreams is not in the TS types
    const senderStreams = sender.createEncodedStreams()
    const readable: ReadableStream = senderStreams.readable
    const writable: WritableStream = senderStreams.writable

    const transformStream = new TransformStream({
      transform: async (frame, controller) => {
        try {
          if (!this.encryptedSymmetricKey || !this.encryptionEnabled) {
            controller.enqueue(frame)
            return
          }

          const frameData = new Uint8Array(frame.data)
          const { encryptedData } = await this.vaultClient.encryptWithKey(
            frameData.buffer as ArrayBuffer,
            this.encryptedSymmetricKey
          )

          frame.data = encryptedData
          controller.enqueue(frame)
        } catch (err) {
          // On error, pass frame through unencrypted to avoid blocking the pipeline
          controller.enqueue(frame)
          console.error('[VaultE2EE] encrypt frame error:', err)
        }
      },
    })

    readable.pipeThrough(transformStream).pipeTo(writable)

    // @ts-expect-error - custom flag
    sender[E2EE_FLAG] = true
  }

  private setupReceiver(track: RemoteTrack, participantIdentity: string): void {
    if (!track.receiver) return

    const receiver = track.receiver

    if (E2EE_FLAG in receiver) return

    // @ts-expect-error - createEncodedStreams is not in the TS types
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

    const transformStream = new TransformStream({
      transform: async (frame, controller) => {
        try {
          if (!this.encryptedSymmetricKey || !this.encryptionEnabled) {
            controller.enqueue(frame)
            return
          }

          const frameData = new Uint8Array(frame.data)
          const { data } = await this.vaultClient.decryptWithKey(
            frameData.buffer as ArrayBuffer,
            this.encryptedSymmetricKey
          )

          frame.data = data
          controller.enqueue(frame)
        } catch (err) {
          // Decryption failed — emit error and drop frame
          this.emit(
            EncryptionEvent.EncryptionError,
            new Error(`Decryption failed for ${participantIdentity}`),
            participantIdentity
          )
        }
      },
    })

    readable.pipeThrough(transformStream).pipeTo(writable)

    // @ts-expect-error
    receiver[E2EE_FLAG] = true
  }
}
