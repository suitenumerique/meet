import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryClient } from '@/api/queryClient'
import { keys } from '@/api/queryKeys'
import { ApiAccessLevel, type ApiRoom } from './ApiRoom'
import { fetchRoom } from './fetchRoom'
import { resyncRoomSettings } from './patchRoom'

vi.mock('./fetchRoom', () => ({ fetchRoom: vi.fn() }))

const ROOM_ID = 'abc-defg-hij'

const CACHED_ROOM: ApiRoom = {
  id: 'f8a2c1d4-0000-4000-8000-000000000000',
  name: ROOM_ID,
  slug: ROOM_ID,
  pin_code: '123456',
  access_level: ApiAccessLevel.PUBLIC,
  configuration: { everyone_can_mute: true },
  livekit: {
    url: 'https://livekit.example.org',
    room: 'f8a2c1d4-0000-4000-8000-000000000000',
    token: 'cached-token',
  },
}

const FETCHED_ROOM: ApiRoom = {
  ...CACHED_ROOM,
  name: 'renamed',
  access_level: ApiAccessLevel.RESTRICTED,
  configuration: { everyone_can_mute: false },
  livekit: undefined,
}

afterEach(() => {
  queryClient.clear()
  vi.restoreAllMocks()
})

const RESYNCED_ROOM: ApiRoom = {
  ...CACHED_ROOM,
  access_level: ApiAccessLevel.RESTRICTED,
  configuration: { everyone_can_mute: false },
}

describe('resyncRoomSettings', () => {
  it('merges only the settings of the fetched room into the cached room', async () => {
    vi.mocked(fetchRoom).mockResolvedValue(FETCHED_ROOM)
    queryClient.setQueryData([keys.room, ROOM_ID], CACHED_ROOM)

    await resyncRoomSettings(ROOM_ID)

    expect(fetchRoom).toHaveBeenCalledExactlyOnceWith({ roomId: ROOM_ID })
    expect(queryClient.getQueryData([keys.room, ROOM_ID])).toEqual(
      RESYNCED_ROOM
    )
  })

  it('leaves the cache to the update that started meanwhile', async () => {
    vi.mocked(fetchRoom).mockResolvedValue(FETCHED_ROOM)
    vi.spyOn(queryClient, 'isMutating').mockReturnValue(1)
    queryClient.setQueryData([keys.room, ROOM_ID], CACHED_ROOM)

    await resyncRoomSettings(ROOM_ID)

    expect(queryClient.getQueryData([keys.room, ROOM_ID])).toBe(CACHED_ROOM)
  })

  it('keeps the answer of the latest resync', async () => {
    let answerEarlier: (room: ApiRoom) => void = () => undefined
    vi.mocked(fetchRoom)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          answerEarlier = resolve
        })
      )
      .mockResolvedValueOnce(FETCHED_ROOM)
    queryClient.setQueryData([keys.room, ROOM_ID], CACHED_ROOM)

    const earlier = resyncRoomSettings(ROOM_ID)
    await resyncRoomSettings(ROOM_ID)
    answerEarlier(CACHED_ROOM)
    await earlier

    expect(queryClient.getQueryData([keys.room, ROOM_ID])).toEqual(
      RESYNCED_ROOM
    )
  })

  it('caches nothing when the room is not cached', async () => {
    vi.mocked(fetchRoom).mockResolvedValue(FETCHED_ROOM)

    await resyncRoomSettings(ROOM_ID)

    expect(queryClient.getQueryData([keys.room, ROOM_ID])).toBeUndefined()
  })
})
