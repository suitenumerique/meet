import { describe, expect, it } from 'vitest'
import { ParticipantKind } from 'livekit-client'
import {
  MAIN_GROUP,
  allowedListeners,
  groupOf,
  inSameGroup,
  readSignal,
  type BreakoutSignal,
} from './group'

const signal: BreakoutSignal = {
  session_id: 's1',
  rooms: ['Room 1', 'Room 2'],
  assignments: { alice: 0, bob: 0, carol: 1 },
}

const person = (identity: string, kind = ParticipantKind.STANDARD) => ({
  identity,
  kind,
})

describe('groupOf', () => {
  it('puts an unassigned identity in the main group', () => {
    expect(groupOf(signal, 'alice')).toBe(0)
    expect(groupOf(signal, 'host')).toBe(MAIN_GROUP)
    expect(groupOf(null, 'alice')).toBe(MAIN_GROUP)
  })

  it('pairs two identities only within one room', () => {
    expect(inSameGroup(signal, 'alice', 'bob')).toBe(true)
    expect(inSameGroup(signal, 'alice', 'carol')).toBe(false)
    expect(inSameGroup(signal, 'alice', 'host')).toBe(false)
    expect(inSameGroup(signal, 'host', 'dave')).toBe(true)
  })
})

describe('allowedListeners', () => {
  it('lets everyone listen outside a split', () => {
    expect(allowedListeners(null, 'alice', [person('bob')])).toBeNull()
  })

  it('names the rest of the room, connected or not', () => {
    expect(allowedListeners(signal, 'alice', [])).toEqual(['bob'])
    expect(allowedListeners(signal, 'carol', [person('alice')])).toEqual([])
  })

  it('names the main group with its phone callers, never agents or recorders', () => {
    const others = [
      person('alice'),
      person('dave'),
      person('phone', ParticipantKind.SIP),
      person('subtitles', ParticipantKind.AGENT),
      person('recorder', ParticipantKind.EGRESS),
    ]
    expect(allowedListeners(signal, 'host', others)).toEqual(['dave', 'phone'])
  })
})

describe('readSignal', () => {
  it('reads the split from the meeting metadata', () => {
    expect(readSignal(JSON.stringify({ breakout: signal }))).toEqual(signal)
  })

  it('keeps one reading per session, whatever else the metadata holds', () => {
    const first = readSignal(JSON.stringify({ breakout: signal }))
    const again = readSignal(
      JSON.stringify({ breakout: signal, recording_status: 'saving' })
    )
    expect(again).toBe(first)
    const next = readSignal(
      JSON.stringify({ breakout: { ...signal, session_id: 's2' } })
    )
    expect(next).not.toBe(first)
    expect(next?.session_id).toBe('s2')
  })

  it('reads no split from metadata without one, or unreadable', () => {
    expect(readSignal(undefined)).toBeNull()
    expect(readSignal('')).toBeNull()
    expect(readSignal('{not json')).toBeNull()
    expect(readSignal(JSON.stringify({ access_level: 'public' }))).toBeNull()
    expect(
      readSignal(JSON.stringify({ breakout: { session_id: 's1' } }))
    ).toBeNull()
  })
})
