import { describe, expect, it } from 'vitest'
import { toLiveKitRoomBody } from './liveKitRoomRequest'

describe('toLiveKitRoomBody', () => {
  it.each([
    [{ kind: 'ensure' }, { ensure_room: true }],
    [{ kind: 'locate' }, { ensure_room: false }],
    [
      { kind: 'recover', failure: 'missing', failedRoomSid: 'RM_failed' },
      { ensure_room: false, failure: 'missing', failed_room_sid: 'RM_failed' },
    ],
    [
      { kind: 'recover', failure: 'deleted', failedRoomSid: 'RM_failed' },
      { ensure_room: false, failure: 'deleted', failed_room_sid: 'RM_failed' },
    ],
  ] as const)('turns %j into %j', (request, body) => {
    expect(toLiveKitRoomBody(request)).toEqual(body)
  })
})
