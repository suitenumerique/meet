// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Conference } from './Conference'
import type { ApiRoom } from '../api/ApiRoom'

/* eslint-disable @typescript-eslint/no-explicit-any */
const h = vi.hoisted(() => ({
  breakout: false,
  rooms: [] as any[],
  roomGivenToLiveKit: [] as any[],
  restrictedBeforeConnect: undefined as boolean | undefined,
}))

vi.mock('@livekit/components-react', async (orig) => ({
  ...(await orig<typeof import('@livekit/components-react')>()),
  LiveKitRoom: (props: { room: unknown; children: ReactNode }) => {
    h.roomGivenToLiveKit.push(props.room)
    return <>{props.children}</>
  },
}))
vi.mock('livekit-client', async (orig) => {
  const actual = await orig<typeof import('livekit-client')>()
  class FakeRoom {
    state = 'disconnected'
    numParticipants = 1
    localParticipant = {
      name: 'guest',
      setTrackSubscriptionPermissions: vi.fn(),
    }
    prepareConnection = async () => undefined
    constructor() {
      h.rooms.push(this)
    }
  }
  return { ...actual, Room: FakeRoom }
})
vi.mock('@/features/rooms/livekit/components/blur', () => ({
  BackgroundProcessorFactory: { fromProcessorConfig: () => undefined },
}))
vi.mock('@/api/useConfig', () => ({
  useConfig: () => ({
    data: {
      livekit: { url: 'https://lk.test', default_video_codec: 'vp9' },
      auto_mute_on_join_threshold: 100,
      breakout_rooms: { is_enabled: h.breakout },
    },
  }),
}))
vi.mock('@/features/analytics/telemetry', () => ({
  captureEvent: vi.fn(),
  captureMediaEvent: vi.fn(async () => undefined),
  reportError: vi.fn(),
}))
vi.mock('@/features/breakout/components/BreakoutRoomTracker', () => ({
  BreakoutRoomTracker: (props: { restrictedBeforeConnect: boolean }) => {
    h.restrictedBeforeConnect = props.restrictedBeforeConnect
    return null
  },
}))
vi.mock('../livekit/prefabs/VideoConference', () => ({
  VideoConference: () => null,
}))
vi.mock('./InviteDialog', () => ({ InviteDialog: () => null }))
vi.mock('@/features/pip/components/PictureInPictureConference', () => ({
  PictureInPictureConference: () => null,
}))
vi.mock('@/features/devtools', () => ({ MeetDevtools: () => null }))
vi.mock('./WatchMediaDeviceErrors', () => ({
  WatchMediaDeviceErrors: () => null,
}))
vi.mock('@/layout/Screen', () => ({
  Screen: (p: { children: ReactNode }) => <>{p.children}</>,
}))
vi.mock('@/components/QueryAware', () => ({
  QueryAware: (p: { children: ReactNode }) => <>{p.children}</>,
}))
vi.mock('@/utils/useIsMobile', () => ({ useIsMobile: () => false }))

const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Conference
        roomId="abc-defg-hij"
        initialRoomData={
          {
            id: 'main-id',
            slug: 'abc-defg-hij',
            livekit: { url: 'https://lk.test', room: 'main-id', token: 't' },
          } as ApiRoom
        }
      />
    </QueryClientProvider>
  )

afterEach(() => {
  cleanup()
  Object.assign(h, {
    rooms: [],
    roomGivenToLiveKit: [],
    restrictedBeforeConnect: undefined,
  })
})

describe('Conference', () => {
  it('lets nobody receive this browser before it knows its room', () => {
    h.breakout = true
    mount()

    const room = h.roomGivenToLiveKit[0]
    expect(
      room.localParticipant.setTrackSubscriptionPermissions
    ).toHaveBeenCalledWith(false)
    expect(h.restrictedBeforeConnect).toBe(true)
  })

  it('leaves the room open on joining where breakout rooms are off', () => {
    h.breakout = false
    mount()

    const room = h.roomGivenToLiveKit[0]
    expect(
      room.localParticipant.setTrackSubscriptionPermissions
    ).not.toHaveBeenCalled()
    // It still keeps to its room once it reads a split.
    expect(h.restrictedBeforeConnect).toBe(false)
  })
})
