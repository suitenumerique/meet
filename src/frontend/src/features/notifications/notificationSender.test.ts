import { describe, expect, it, vi } from 'vitest'
import { type RemoteParticipant, Room } from 'livekit-client'
import { NotificationType } from './NotificationType'
import type { ApiRoom } from '@/features/rooms/api/ApiRoom'
import {
  isAllowedNotificationSender,
  type SenderRules,
  senderRulesFor,
  subscribeToNotifications,
} from './notificationSender'

vi.mock('@/features/analytics/telemetry', () => ({ reportError: vi.fn() }))

const participant = (
  attributes: Record<string, string>,
  identity = 'someone'
) => ({ identity, attributes, emit: vi.fn() }) as unknown as RemoteParticipant

const owner = participant({ room_role: 'owner', is_authenticated: 'true' })
const admin = participant({
  room_role: 'administrator',
  is_authenticated: 'true',
})
const member = participant({ room_role: 'member', is_authenticated: 'true' })
const signedIn = participant({ is_authenticated: 'true' })
const guest = participant({ is_authenticated: 'false' })

const CLOSED: SenderRules = {
  isRecordingOpenToParticipants: false,
  everyoneCanMute: false,
}
const OPEN: SenderRules = {
  isRecordingOpenToParticipants: true,
  everyoneCanMute: true,
}

describe('isAllowedNotificationSender', () => {
  it.each([
    NotificationType.TranscriptionLimitReached,
    NotificationType.ScreenRecordingLimitReached,
    NotificationType.TranscriptionInterrupted,
    NotificationType.ScreenRecordingInterrupted,
    NotificationType.TranscriptionFailed,
    NotificationType.ScreenRecordingFailed,
    NotificationType.TranscriptionAborted,
    NotificationType.ScreenRecordingAborted,
    NotificationType.ParticipantWaiting,
  ])('takes %s from the backend alone', (type) => {
    const allowed = (sender?: RemoteParticipant, identity?: string) =>
      isAllowedNotificationSender(type, sender, identity, OPEN)

    expect(allowed(undefined, '')).toBe(true)
    expect(allowed(owner, '')).toBe(false)
    expect(allowed(guest, 'someone')).toBe(false)
    expect(allowed(owner, 'someone')).toBe(false)
    expect(allowed(undefined, 'not-on-the-roster-yet')).toBe(false)
    expect(allowed(undefined, undefined)).toBe(false)
  })

  it('takes a permissions notice from a host alone', () => {
    const allowed = (sender?: RemoteParticipant) =>
      isAllowedNotificationSender(
        NotificationType.PermissionsRemoved,
        sender,
        'someone',
        OPEN
      )

    expect(allowed(owner)).toBe(true)
    expect(allowed(admin)).toBe(true)
    expect(allowed(member)).toBe(false)
    expect(allowed(signedIn)).toBe(false)
    expect(allowed(guest)).toBe(false)
    expect(allowed(undefined)).toBe(false)
  })

  it('follows the room setting for a mute notice', () => {
    const allowed = (
      sender: RemoteParticipant | undefined,
      rules: SenderRules
    ) =>
      isAllowedNotificationSender(
        NotificationType.ParticipantMuted,
        sender,
        'someone',
        rules
      )

    expect(allowed(guest, OPEN)).toBe(true)
    expect(allowed(guest, CLOSED)).toBe(false)
    expect(allowed(member, CLOSED)).toBe(false)
    expect(allowed(owner, CLOSED)).toBe(true)
    expect(allowed(undefined, OPEN)).toBe(false)
  })

  it.each([
    NotificationType.TranscriptionStarted,
    NotificationType.TranscriptionStopped,
    NotificationType.ScreenRecordingStarted,
    NotificationType.ScreenRecordingStopped,
  ])('takes %s from whoever may record', (type) => {
    const allowed = (
      sender: RemoteParticipant | undefined,
      rules: SenderRules
    ) => isAllowedNotificationSender(type, sender, 'someone', rules)

    expect(allowed(owner, CLOSED)).toBe(true)
    expect(allowed(admin, CLOSED)).toBe(true)
    expect(allowed(signedIn, OPEN)).toBe(true)
    expect(allowed(signedIn, CLOSED)).toBe(false)
    expect(allowed(guest, OPEN)).toBe(false)
    expect(allowed(undefined, OPEN)).toBe(false)
  })

  it.each([
    NotificationType.ReactionReceived,
    NotificationType.TranscriptionRequested,
    NotificationType.ScreenRecordingRequested,
  ])('takes %s from anyone on the roster', (type) => {
    const allowed = (sender: RemoteParticipant | undefined) =>
      isAllowedNotificationSender(type, sender, 'someone', CLOSED)

    expect(allowed(guest)).toBe(true)
    expect(allowed(undefined)).toBe(false)
  })

  it('refuses a type no message carries', () => {
    expect(
      isAllowedNotificationSender(
        NotificationType.ParticipantJoined,
        owner,
        'someone',
        OPEN
      )
    ).toBe(false)
  })
})

describe('senderRulesFor', () => {
  const room = (everyone_can_mute?: boolean | null) =>
    ({
      id: 'room',
      configuration:
        everyone_can_mute === undefined ? {} : { everyone_can_mute },
    }) as unknown as ApiRoom

  it('reads the mute setting the way the backend does', () => {
    expect(senderRulesFor(undefined, room()).everyoneCanMute).toBe(true)
    expect(senderRulesFor(undefined, room(true)).everyoneCanMute).toBe(true)
    expect(senderRulesFor(undefined, room(false)).everyoneCanMute).toBe(false)
    expect(senderRulesFor(undefined, room(null)).everyoneCanMute).toBe(false)
  })
})

describe('subscribeToNotifications', () => {
  // Runs the media client's own packet handling, so its event signature is
  // what the guard is tested against.
  const deliver = (room: Room, identity: string, text: string) =>
    (
      room as unknown as {
        handleDataPacket: (packet: unknown, encryption: number) => void
      }
    ).handleDataPacket(
      {
        participantIdentity: identity,
        kind: 0,
        value: {
          case: 'user',
          value: { payload: new TextEncoder().encode(text), topic: '' },
        },
      },
      0
    )

  const receive = (room: Room, identity: string, type: NotificationType) =>
    deliver(room, identity, JSON.stringify({ type }))

  const subscribe = (
    listed: RemoteParticipant[] = [],
    getRules?: () => SenderRules
  ) => {
    const room = new Room()
    listed.forEach((p) => room.remoteParticipants.set(p.identity, p))
    const handler = vi.fn()
    const unsubscribe = subscribeToNotifications(room, handler, getRules)
    return { room, handler, unsubscribe }
  }

  const limit = NotificationType.ScreenRecordingLimitReached

  it('hands over what the backend sent, with no sender', () => {
    const { room, handler } = subscribe()

    receive(room, '', limit)

    expect(handler).toHaveBeenCalledExactlyOnceWith({ type: limit }, undefined)
  })

  it('drops a backend type from a sender the roster has not listed yet', () => {
    const { room, handler } = subscribe()

    receive(room, 'not-on-the-roster-yet', limit)

    expect(handler).not.toHaveBeenCalled()
  })

  it('names the listed sender and drops a backend type from them', () => {
    const sender = participant({ is_authenticated: 'false' }, 'listed')
    const { room, handler } = subscribe([sender])

    receive(room, 'listed', limit)
    expect(handler).not.toHaveBeenCalled()

    receive(room, 'listed', NotificationType.ReactionReceived)
    expect(handler).toHaveBeenCalledExactlyOnceWith(
      { type: NotificationType.ReactionReceived },
      sender
    )
  })

  it('holds a sender to host rights when given no rules', () => {
    const { room, handler } = subscribe([
      participant({ is_authenticated: 'true' }, 'listed'),
    ])

    receive(room, 'listed', NotificationType.ParticipantMuted)
    receive(room, 'listed', NotificationType.ScreenRecordingStopped)

    expect(handler).not.toHaveBeenCalled()
  })

  it('reads the rules when a message arrives', () => {
    let rules = CLOSED
    const { room, handler } = subscribe(
      [participant({ is_authenticated: 'false' }, 'listed')],
      () => rules
    )

    receive(room, 'listed', NotificationType.ParticipantMuted)
    expect(handler).not.toHaveBeenCalled()

    rules = OPEN
    receive(room, 'listed', NotificationType.ParticipantMuted)
    expect(handler).toHaveBeenCalledOnce()
  })

  it('ignores a payload that decodes to nothing', () => {
    const { room, handler } = subscribe()

    deliver(room, '', 'not json')
    deliver(room, '', 'null')

    expect(handler).not.toHaveBeenCalled()
  })

  it('stops listening once unsubscribed', () => {
    const { room, handler, unsubscribe } = subscribe()

    unsubscribe()
    receive(room, '', limit)

    expect(handler).not.toHaveBeenCalled()
  })
})
