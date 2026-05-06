/**
 * In-call encryption state machine and pause protocol.
 *
 * Three phases:
 *  - UNENCRYPTED   — the room is not end-to-end encrypted.
 *  - ENCRYPTED     — E2EE is active; frames are encrypted with the URL passphrase.
 *  - PAUSED        — encryption is temporarily paused for this session, typically
 *                    so the SFU can record / transcribe.
 *
 * The "paused" state is intentionally ephemeral: it is never persisted in the
 * database. The truth source for "this call is encrypted" is the presence of
 * the passphrase in the URL hash, not a server-side flag — a hacked server
 * cannot fabricate a passphrase that all participants happen to share.
 *
 * Pause is broadcast over a LiveKit reliable data channel. While the sender
 * has not yet flipped its own state, the message itself travels encrypted,
 * which is the trust anchor: only callers who hold the passphrase can produce
 * frames everyone can decrypt.
 *
 * Pause is reversible: when both recording and transcription have stopped,
 * the participant who initiated the pause broadcasts ENCRYPTION_RESUMED and
 * everyone re-enables E2EE with the same URL passphrase.
 *
 * Initiation: admins can always pause/resume. If no admin is in the room and
 * a pause has already been observed in this session (everSeenPause), the
 * leader (oldest non-SIP participant) may also pause/resume — this covers
 * the "the admin left mid-call" edge case without granting unsolicited
 * pause power to non-admins.
 */
import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useRoomContext } from '@livekit/components-react'
import {
  DataPacket_Kind,
  Participant,
  ParticipantKind,
  RemoteParticipant,
  RoomEvent,
} from 'livekit-client'
import { EncryptionStatusContext } from './encryptionStatusContextValue'
import { EncryptionPhase, PauseReason } from './encryptionStatusTypes'

const ENCRYPTION_TOPIC = 'encryption-state'
const PROBE_RESPONSE_GRACE_MS = 2500

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

interface ProtocolMessage {
  type:
    | 'ENCRYPTION_PAUSED'
    | 'ENCRYPTION_RESUMED'
    | 'ENCRYPTION_STATUS_PROBE'
  reason?: PauseReason
  /** Sender's `joinedAt` timestamp; used in leader election. */
  senderJoinedAt?: number
  /** Whether the sender is a room admin/owner. */
  senderIsAdmin?: boolean
}

function encodeMessage(msg: ProtocolMessage): Uint8Array {
  return textEncoder.encode(JSON.stringify(msg))
}

function decodeMessage(payload: Uint8Array): ProtocolMessage | null {
  try {
    return JSON.parse(textDecoder.decode(payload)) as ProtocolMessage
  } catch {
    return null
  }
}

function isParticipantAdmin(participant: Participant | undefined): boolean {
  return participant?.attributes?.room_admin === 'true'
}

function isParticipantPhoneOrSip(p: Participant): boolean {
  return p.kind === ParticipantKind.SIP
}

interface EncryptionStatusProviderProps {
  children: ReactNode
  /** Whether this room is end-to-end encrypted. */
  isEncrypted: boolean
  /** Called when the local client should toggle E2EE on/off. */
  onPhaseChange?: (phase: EncryptionPhase) => void
}

export function EncryptionStatusProvider({
  children,
  isEncrypted,
  onPhaseChange,
}: EncryptionStatusProviderProps) {
  const room = useRoomContext()
  const initialPhase = isEncrypted
    ? EncryptionPhase.ENCRYPTED
    : EncryptionPhase.UNENCRYPTED
  const [phase, setPhase] = useState<EncryptionPhase>(initialPhase)
  const [pauseReason, setPauseReason] = useState<PauseReason | undefined>()
  const [pausedByMe, setPausedByMe] = useState(false)
  const everSeenPauseRef = useRef(false)
  const phaseRef = useRef(phase)
  phaseRef.current = phase

  // When the encrypted flag changes (e.g. on initial room data load), align
  // the local phase. The pause path keeps phase=PAUSED across updates.
  useEffect(() => {
    if (!isEncrypted && phaseRef.current !== EncryptionPhase.UNENCRYPTED) {
      setPhase(EncryptionPhase.UNENCRYPTED)
      setPauseReason(undefined)
      setPausedByMe(false)
    } else if (
      isEncrypted &&
      phaseRef.current === EncryptionPhase.UNENCRYPTED
    ) {
      setPhase(EncryptionPhase.ENCRYPTED)
    }
  }, [isEncrypted])

  // Push phase transitions to LiveKit (E2EE on/off + republish).
  useEffect(() => {
    onPhaseChange?.(phase)
  }, [phase, onPhaseChange])

  const sendProtocolMessage = useCallback(
    async (msg: ProtocolMessage, destination?: string[]) => {
      try {
        await room.localParticipant.publishData(encodeMessage(msg), {
          reliable: true,
          topic: ENCRYPTION_TOPIC,
          destinationIdentities: destination,
        })
      } catch (err) {
        console.error('[encryption] failed to publish protocol message', err)
      }
    },
    [room]
  )

  /**
   * Determine whether we (locally) consider `sender` legitimate to issue
   * pause/resume messages.
   *
   * Always true for admins. For non-admins, true only if there is no admin
   * currently in the room AND the sender is the oldest non-SIP participant
   * we know of (deterministic across peers via joinedAt+identity).
   */
  const isLegitimatePauseSender = useCallback(
    (sender: RemoteParticipant | undefined): boolean => {
      if (!sender) return false
      if (isParticipantAdmin(sender)) return true

      const everyone: Participant[] = [
        room.localParticipant,
        ...Array.from(room.remoteParticipants.values()),
      ]
      const adminPresent = everyone.some(isParticipantAdmin)
      if (adminPresent) return false

      const eligible = everyone.filter((p) => !isParticipantPhoneOrSip(p))
      const sorted = eligible.sort((a, b) => {
        const aJ = a.joinedAt?.getTime() ?? Number.MAX_SAFE_INTEGER
        const bJ = b.joinedAt?.getTime() ?? Number.MAX_SAFE_INTEGER
        if (aJ !== bJ) return aJ - bJ
        return a.identity.localeCompare(b.identity)
      })
      const leader = sorted[0]
      return !!leader && leader.identity === sender.identity
    },
    [room]
  )

  /** Same logic but applied to the local participant (am I allowed to act?). */
  const localCanInitiate = useCallback((): boolean => {
    if (isParticipantAdmin(room.localParticipant)) return true
    if (!everSeenPauseRef.current) return false

    const everyone: Participant[] = [
      room.localParticipant,
      ...Array.from(room.remoteParticipants.values()),
    ]
    if (everyone.some(isParticipantAdmin)) return false

    const eligible = everyone.filter((p) => !isParticipantPhoneOrSip(p))
    const sorted = eligible.sort((a, b) => {
      const aJ = a.joinedAt?.getTime() ?? Number.MAX_SAFE_INTEGER
      const bJ = b.joinedAt?.getTime() ?? Number.MAX_SAFE_INTEGER
      if (aJ !== bJ) return aJ - bJ
      return a.identity.localeCompare(b.identity)
    })
    return sorted[0]?.identity === room.localParticipant.identity
  }, [room])

  const handlePauseAnnouncement = useCallback(
    (msg: ProtocolMessage, sender?: RemoteParticipant) => {
      if (!isLegitimatePauseSender(sender)) return
      everSeenPauseRef.current = true
      if (phaseRef.current !== EncryptionPhase.ENCRYPTED) return

      setPhase(EncryptionPhase.PAUSED)
      setPauseReason(msg.reason)
      setPausedByMe(false)
    },
    [isLegitimatePauseSender]
  )

  const handleResumeAnnouncement = useCallback(
    (sender?: RemoteParticipant) => {
      if (!isLegitimatePauseSender(sender)) return
      if (phaseRef.current !== EncryptionPhase.PAUSED) return

      setPhase(EncryptionPhase.ENCRYPTED)
      setPauseReason(undefined)
      setPausedByMe(false)
    },
    [isLegitimatePauseSender]
  )

  const handleProbe = useCallback(
    (sender: RemoteParticipant) => {
      if (phaseRef.current !== EncryptionPhase.PAUSED) return
      // We respond if we ourselves are a legitimate sender for this room.
      if (!localCanInitiate()) return

      void sendProtocolMessage(
        {
          type: 'ENCRYPTION_PAUSED',
          reason: pauseReason,
          senderIsAdmin: isParticipantAdmin(room.localParticipant),
          senderJoinedAt:
            room.localParticipant.joinedAt?.getTime() ?? Date.now(),
        },
        [sender.identity]
      )
    },
    [room, pauseReason, sendProtocolMessage, localCanInitiate]
  )

  // Subscribe to encryption-channel data messages.
  useEffect(() => {
    if (!isEncrypted) return

    const handler = (
      payload: Uint8Array,
      participant?: RemoteParticipant,
      _kind?: DataPacket_Kind,
      topic?: string
    ) => {
      if (topic !== ENCRYPTION_TOPIC) return
      const msg = decodeMessage(payload)
      if (!msg) return
      if (msg.type === 'ENCRYPTION_PAUSED') {
        handlePauseAnnouncement(msg, participant)
      } else if (msg.type === 'ENCRYPTION_RESUMED') {
        handleResumeAnnouncement(participant)
      } else if (msg.type === 'ENCRYPTION_STATUS_PROBE' && participant) {
        handleProbe(participant)
      }
    }

    room.on(RoomEvent.DataReceived, handler)
    return () => {
      room.off(RoomEvent.DataReceived, handler)
    }
  }, [
    room,
    isEncrypted,
    handlePauseAnnouncement,
    handleResumeAnnouncement,
    handleProbe,
  ])

  // On join, ask the room whether encryption is currently paused.
  useEffect(() => {
    if (!isEncrypted) return
    if (phase !== EncryptionPhase.ENCRYPTED) return

    let cancelled = false
    const timer = setTimeout(() => {
      if (cancelled) return
      void sendProtocolMessage({ type: 'ENCRYPTION_STATUS_PROBE' })
    }, 0)
    const cleanup = setTimeout(() => {
      // Nothing to do — if no answer arrived, we stay encrypted.
    }, PROBE_RESPONSE_GRACE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
      clearTimeout(cleanup)
    }
    // we intentionally only run this when joining the encrypted state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEncrypted])

  const pauseEncryption = useCallback(
    async (reason: PauseReason) => {
      if (phaseRef.current !== EncryptionPhase.ENCRYPTED) return false
      if (!localCanInitiate()) return false

      everSeenPauseRef.current = true
      setPhase(EncryptionPhase.PAUSED)
      setPauseReason(reason)
      setPausedByMe(true)

      await sendProtocolMessage({
        type: 'ENCRYPTION_PAUSED',
        reason,
        senderIsAdmin: isParticipantAdmin(room.localParticipant),
        senderJoinedAt:
          room.localParticipant.joinedAt?.getTime() ?? Date.now(),
      })
      return true
    },
    [room, sendProtocolMessage, localCanInitiate]
  )

  const resumeEncryption = useCallback(async () => {
    if (phaseRef.current !== EncryptionPhase.PAUSED) return false
    if (!localCanInitiate()) return false

    setPhase(EncryptionPhase.ENCRYPTED)
    setPauseReason(undefined)
    setPausedByMe(false)

    await sendProtocolMessage({
      type: 'ENCRYPTION_RESUMED',
      senderIsAdmin: isParticipantAdmin(room.localParticipant),
      senderJoinedAt: room.localParticipant.joinedAt?.getTime() ?? Date.now(),
    })
    return true
  }, [room, sendProtocolMessage, localCanInitiate])

  const value = useMemo(
    () => ({
      phase,
      pauseReason,
      pausedByMe,
      pauseEncryption,
      resumeEncryption,
    }),
    [phase, pauseReason, pausedByMe, pauseEncryption, resumeEncryption]
  )

  return (
    <EncryptionStatusContext.Provider value={value}>
      {children}
    </EncryptionStatusContext.Provider>
  )
}
