// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { ConnectionState, ParticipantKind, RoomEvent } from 'livekit-client'
import { useBreakoutMediaPermissions } from './useBreakoutMediaPermissions'

type Publication = {
  isDesired: boolean
  setSubscribed: ReturnType<typeof vi.fn>
}
type Remote = {
  identity: string
  kind: ParticipantKind
  trackPublications: Map<string, Publication>
}

const h = vi.hoisted(() => ({
  state: 'connected' as string,
  metadata: '',
  remotes: [] as unknown[],
  room: undefined as unknown,
}))

vi.mock('@livekit/components-react', () => ({
  useRoomContext: () => h.room,
  useConnectionState: () => h.state,
  useRoomInfo: () => ({ metadata: h.metadata }),
  useRemoteParticipants: () => h.remotes,
}))

const publication = (isDesired = true): Publication => {
  const pub = { isDesired, setSubscribed: vi.fn() }
  pub.setSubscribed.mockImplementation((value: boolean) => {
    pub.isDesired = value
  })
  return pub
}

const remote = (identity: string, kind = ParticipantKind.STANDARD): Remote => ({
  identity,
  kind,
  trackPublications: new Map([['mic', publication()]]),
})

const split = (assignments: Record<string, number>) =>
  JSON.stringify({
    breakout: {
      session_id: JSON.stringify(assignments),
      rooms: ['Room 1', 'Room 2'],
      assignments,
    },
  })

let handlers: Map<string, (...args: unknown[]) => void>
let permissions: ReturnType<typeof vi.fn>

const setUp = (me: string, remotes: Remote[], metadata = '') => {
  handlers = new Map()
  permissions = vi.fn()
  h.remotes = remotes
  h.metadata = metadata
  h.room = {
    get metadata() {
      return h.metadata
    },
    localParticipant: {
      identity: me,
      setTrackSubscriptionPermissions: permissions,
    },
    remoteParticipants: new Map(remotes.map((r) => [r.identity, r])),
    on: (event: string, handler: (...args: unknown[]) => void) =>
      handlers.set(event, handler),
    off: (event: string) => handlers.delete(event),
  }
}

const listed = (identities: string[]) =>
  identities.map((identity) => ({
    participantIdentity: identity,
    allowAll: true,
  }))

const mic = (r: Remote) => r.trackPublications.get('mic') as Publication

beforeEach(() => {
  h.state = ConnectionState.Connected
})

describe('useBreakoutMediaPermissions', () => {
  it('leaves the list stored before connecting until the meeting answers', () => {
    h.state = ConnectionState.Connecting
    setUp('alice', [], split({ alice: 0 }))
    renderHook(() => useBreakoutMediaPermissions(true))
    expect(permissions).not.toHaveBeenCalled()
  })

  it('lets everyone listen outside a split', () => {
    setUp('alice', [remote('bob')])
    renderHook(() => useBreakoutMediaPermissions(true))
    expect(permissions).toHaveBeenCalledWith(true, [])
  })

  it('lets only the room listen in a split, and plays only the room', () => {
    const bob = remote('bob')
    const carol = remote('carol')
    const phone = remote('phone', ParticipantKind.SIP)
    setUp('alice', [bob, carol, phone], split({ alice: 0, bob: 0, carol: 1 }))
    renderHook(() => useBreakoutMediaPermissions(true))

    expect(permissions).toHaveBeenLastCalledWith(false, listed(['bob']))
    expect(mic(bob).setSubscribed).not.toHaveBeenCalled()
    expect(mic(carol).setSubscribed).toHaveBeenCalledWith(false)
    expect(mic(phone).setSubscribed).toHaveBeenCalledWith(false)
  })

  it('lets nobody listen to someone alone in a room', () => {
    setUp('carol', [remote('alice')], split({ alice: 0, carol: 1 }))
    renderHook(() => useBreakoutMediaPermissions(true))
    expect(permissions).toHaveBeenLastCalledWith(false, [])
  })

  it('keeps the main room to its people and phone callers', () => {
    const others = [
      remote('alice'),
      remote('dave'),
      remote('phone', ParticipantKind.SIP),
      remote('subtitles', ParticipantKind.AGENT),
    ]
    setUp('host', others, split({ alice: 0 }))
    renderHook(() => useBreakoutMediaPermissions(true))
    expect(permissions).toHaveBeenLastCalledWith(
      false,
      listed(['dave', 'phone'])
    )
    expect(mic(others[0]).setSubscribed).toHaveBeenCalledWith(false)
    expect(mic(others[2]).setSubscribed).not.toHaveBeenCalled()
  })

  it('stops playing a track another room publishes later', () => {
    const carol = remote('carol')
    setUp('alice', [carol], split({ alice: 0, carol: 1 }))
    renderHook(() => useBreakoutMediaPermissions(true))
    const screen = publication()
    handlers.get(RoomEvent.TrackPublished)?.(screen, carol)
    expect(screen.setSubscribed).toHaveBeenCalledWith(false)
  })

  it('sends a list once, and again only when it changes', () => {
    setUp('host', [remote('dave')], split({ alice: 0 }))
    const { rerender } = renderHook(() => useBreakoutMediaPermissions(true))
    h.remotes = [...h.remotes]
    rerender()
    expect(permissions).toHaveBeenCalledTimes(1)

    h.remotes = [...h.remotes, remote('erin')]
    rerender()
    expect(permissions).toHaveBeenCalledTimes(2)
    expect(permissions).toHaveBeenLastCalledWith(
      false,
      listed(['dave', 'erin'])
    )
  })

  it('reads the room as it is when the connection lands', () => {
    // The hook's own copy of the metadata lags one render behind the room.
    setUp('alice', [remote('carol')], split({ alice: 0, carol: 1 }))
    const room = h.room as { metadata: string }
    h.metadata = ''
    Object.defineProperty(room, 'metadata', {
      get: () => split({ alice: 0, carol: 1 }),
    })
    renderHook(() => useBreakoutMediaPermissions(true))
    expect(permissions).toHaveBeenLastCalledWith(false, [])
  })

  it('keeps the stored list while reconnecting', () => {
    setUp('alice', [], split({ alice: 0 }))
    const { rerender } = renderHook(() => useBreakoutMediaPermissions(true))
    permissions.mockClear()
    h.state = ConnectionState.Reconnecting
    h.metadata = ''
    rerender()
    expect(permissions).not.toHaveBeenCalled()
  })

  it('lets everyone listen and plays everyone again when the split closes', () => {
    const carol = remote('carol')
    setUp('alice', [carol], split({ alice: 0, carol: 1 }))
    const { rerender } = renderHook(() => useBreakoutMediaPermissions(true))
    expect(mic(carol).isDesired).toBe(false)

    h.metadata = ''
    rerender()
    expect(permissions).toHaveBeenLastCalledWith(true, [])
    expect(mic(carol).setSubscribed).toHaveBeenLastCalledWith(true)
  })

  it('sends nothing where nothing was ever restricted', () => {
    setUp('alice', [remote('bob')])
    renderHook(() => useBreakoutMediaPermissions(false))
    expect(permissions).not.toHaveBeenCalled()
  })

  it('isolates a tab loaded with the setting off once a split opens', () => {
    setUp('alice', [remote('bob')])
    const { rerender } = renderHook(() => useBreakoutMediaPermissions(false))

    h.metadata = split({ alice: 0, bob: 0 })
    rerender()
    expect(permissions).toHaveBeenLastCalledWith(false, listed(['bob']))

    h.metadata = ''
    rerender()
    expect(permissions).toHaveBeenLastCalledWith(true, [])
  })
})
