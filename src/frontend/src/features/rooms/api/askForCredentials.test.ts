import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryClient } from '@/api/queryClient'
import { keys } from '@/api/queryKeys'
import {
  clearParticipantId,
  getLobbyParticipantId,
  setLobbyParticipantId,
} from '@/stores/lobby'
import { ApiAccessLevel, type ApiLiveKit, type ApiRoom } from './ApiRoom'
import { askForCredentials } from './askForCredentials'
import { joinRoom } from './joinRoom'
import type { LiveKitRoomRequest } from './liveKitRoomRequest'
import { ApiLobbyStatus, requestEntry } from './requestEntry'

vi.mock('./joinRoom', () => ({ joinRoom: vi.fn() }))
vi.mock('./requestEntry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./requestEntry')>()),
  requestEntry: vi.fn(),
}))
vi.mock('@/stores/user', () => ({ userStore: { username: 'Stored name' } }))

const ROOM_ID = 'abc-defg-hij'
const ROOM_UUID = 'f8a2c1d4-0000-4000-8000-000000000000'
const REQUEST: LiveKitRoomRequest = {
  kind: 'recover',
  failure: 'missing',
  failedRoomSid: 'RM_failed',
}

const NEW_LIVEKIT: ApiLiveKit = {
  url: 'wss://b.example.org',
  room: ROOM_UUID,
  token: 'new-token',
  room_sid: 'RM_new',
}

const CACHED_ROOM: ApiRoom = {
  id: ROOM_UUID,
  name: ROOM_ID,
  slug: ROOM_ID,
  pin_code: '123456',
  access_level: ApiAccessLevel.PUBLIC,
  configuration: {},
  livekit: {
    url: 'wss://a.example.org',
    room: ROOM_UUID,
    token: 'failed-token',
    room_sid: 'RM_failed',
  },
  accesses: [{ id: 'access-id', role: 'administrator' }],
}

const JOINED_ROOM: ApiRoom = {
  id: ROOM_UUID,
  name: ROOM_ID,
  slug: ROOM_ID,
  pin_code: '123456',
  access_level: ApiAccessLevel.TRUSTED,
  configuration: { everyone_can_mute: false },
  livekit: NEW_LIVEKIT,
}

const cachedRoom = () => queryClient.getQueryData<ApiRoom>([keys.room, ROOM_ID])
const ask = (signal = new AbortController().signal) =>
  askForCredentials(ROOM_ID, REQUEST, signal, 'Display name')

afterEach(() => {
  queryClient.clear()
  clearParticipantId(ROOM_ID)
  vi.clearAllMocks()
})

describe('askForCredentials', () => {
  it('joins again and replaces the cached room', async () => {
    vi.mocked(joinRoom).mockResolvedValue(JOINED_ROOM)
    queryClient.setQueryData([keys.room, ROOM_ID], CACHED_ROOM)
    const signal = new AbortController().signal

    expect(await ask(signal)).toBe(NEW_LIVEKIT)

    expect(joinRoom).toHaveBeenCalledExactlyOnceWith({
      roomId: ROOM_ID,
      username: 'Stored name',
      request: REQUEST,
      signal,
    })
    expect(requestEntry).not.toHaveBeenCalled()
    expect(cachedRoom()).toEqual(JOINED_ROOM)
    expect(cachedRoom()).not.toHaveProperty('accesses')
  })

  it('sends a participant who joins without credentials to the lobby', async () => {
    vi.mocked(joinRoom).mockResolvedValue({
      ...JOINED_ROOM,
      livekit: undefined,
    })
    queryClient.setQueryData([keys.room, ROOM_ID], CACHED_ROOM)

    expect(await ask()).toBe('lobby')
    expect(cachedRoom()).toBe(CACHED_ROOM)
  })

  it('asks the lobby again and replaces only the cached credentials', async () => {
    setLobbyParticipantId(ROOM_ID, 'participant-id')
    vi.mocked(requestEntry).mockResolvedValue({
      id: 'new-participant-id',
      status: ApiLobbyStatus.ACCEPTED,
      livekit: NEW_LIVEKIT,
    })
    queryClient.setQueryData([keys.room, ROOM_ID], CACHED_ROOM)
    const signal = new AbortController().signal

    expect(await ask(signal)).toBe(NEW_LIVEKIT)

    expect(requestEntry).toHaveBeenCalledExactlyOnceWith({
      roomId: ROOM_ID,
      username: 'Display name',
      request: REQUEST,
      signal,
    })
    expect(joinRoom).not.toHaveBeenCalled()
    expect(getLobbyParticipantId(ROOM_ID)).toBe('new-participant-id')
    expect(cachedRoom()).toEqual({ ...CACHED_ROOM, livekit: NEW_LIVEKIT })
  })

  it.each([
    [ApiLobbyStatus.WAITING, null, 'lobby'],
    [ApiLobbyStatus.TIMEOUT, null, 'lobby'],
    [ApiLobbyStatus.ACCEPTED, null, 'lobby'],
    [ApiLobbyStatus.DENIED, NEW_LIVEKIT, 'denied'],
  ])(
    'answers a lobby status %s with %s as %s',
    async (status, livekit, answer) => {
      setLobbyParticipantId(ROOM_ID, 'participant-id')
      vi.mocked(requestEntry).mockResolvedValue({ status, livekit })
      queryClient.setQueryData([keys.room, ROOM_ID], CACHED_ROOM)

      expect(await ask()).toBe(answer)
      expect(cachedRoom()).toBe(CACHED_ROOM)
    }
  )

  it('leaves the cache alone once the ask is aborted', async () => {
    vi.mocked(joinRoom).mockResolvedValue(JOINED_ROOM)
    queryClient.setQueryData([keys.room, ROOM_ID], CACHED_ROOM)
    const controller = new AbortController()
    controller.abort()

    await ask(controller.signal)

    expect(cachedRoom()).toBe(CACHED_ROOM)
  })
})
