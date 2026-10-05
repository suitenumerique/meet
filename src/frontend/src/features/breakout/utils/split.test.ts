import { describe, expect, it } from 'vitest'
import { ParticipantKind } from 'livekit-client'
import {
  MAIN_ROOM,
  allowedListeners,
  breakoutRoomOf,
  inSameBreakoutRoom,
  readSplit,
  type BreakoutSplit,
} from './split'

const split: BreakoutSplit = {
  session_id: 's1',
  rooms: ['Room 1', 'Room 2'],
  assignments: { alice: 0, bob: 0, carol: 1 },
}

const person = (identity: string, kind = ParticipantKind.STANDARD) => ({
  identity,
  kind,
})

describe('breakoutRoomOf', () => {
  it('puts an unassigned identity in the main room', () => {
    expect(breakoutRoomOf(split, 'alice')).toBe(0)
    expect(breakoutRoomOf(split, 'host')).toBe(MAIN_ROOM)
    expect(breakoutRoomOf(null, 'alice')).toBe(MAIN_ROOM)
  })

  it('pairs two identities only within one room', () => {
    expect(inSameBreakoutRoom(split, 'alice', 'bob')).toBe(true)
    expect(inSameBreakoutRoom(split, 'alice', 'carol')).toBe(false)
    expect(inSameBreakoutRoom(split, 'alice', 'host')).toBe(false)
    expect(inSameBreakoutRoom(split, 'host', 'dave')).toBe(true)
  })
})

describe('allowedListeners', () => {
  it('lets everyone listen outside a split', () => {
    expect(allowedListeners(null, 'alice', [person('bob')])).toBeNull()
  })

  it('names the rest of the room, connected or not', () => {
    expect(allowedListeners(split, 'alice', [])).toEqual(['bob'])
    expect(allowedListeners(split, 'carol', [person('alice')])).toEqual([])
  })

  it('names the main room with its phone callers, never agents or recorders', () => {
    const others = [
      person('alice'),
      person('dave'),
      person('phone', ParticipantKind.SIP),
      person('subtitles', ParticipantKind.AGENT),
      person('recorder', ParticipantKind.EGRESS),
    ]
    expect(allowedListeners(split, 'host', others)).toEqual(['dave', 'phone'])
  })
})

describe('readSplit', () => {
  it('reads the split from the meeting metadata', () => {
    expect(readSplit(JSON.stringify({ breakout: split }))).toEqual(split)
  })

  it('keeps one reading per session, whatever else the metadata holds', () => {
    const first = readSplit(JSON.stringify({ breakout: split }))
    const again = readSplit(
      JSON.stringify({ breakout: split, recording_status: 'saving' })
    )
    expect(again).toBe(first)
    const next = readSplit(
      JSON.stringify({ breakout: { ...split, session_id: 's2' } })
    )
    expect(next).not.toBe(first)
    expect(next?.session_id).toBe('s2')
  })

  it('reads no split from metadata without one, or unreadable', () => {
    expect(readSplit(undefined)).toBeNull()
    expect(readSplit('')).toBeNull()
    expect(readSplit('{not json')).toBeNull()
    expect(readSplit(JSON.stringify({ access_level: 'public' }))).toBeNull()
    expect(
      readSplit(JSON.stringify({ breakout: { session_id: 's1' } }))
    ).toBeNull()
  })
})
