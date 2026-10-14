import { describe, expect, it } from 'vitest'
import { ParticipantKind, type Participant } from 'livekit-client'
import { buildRooms, isAssignable, shuffleAssignments } from './setup'

const participant = (
  overrides: Partial<Pick<Participant, 'isLocal' | 'kind' | 'attributes'>>
) =>
  ({
    isLocal: false,
    kind: ParticipantKind.STANDARD,
    attributes: { room_role: 'member' },
    ...overrides,
  }) as unknown as Participant

describe('isAssignable', () => {
  it('offers a room to a browser participant', () => {
    expect(isAssignable(participant({}))).toBe(true)
    expect(isAssignable(participant({ attributes: {} }))).toBe(true)
  })

  it('leaves out phone callers and agents, who cannot keep themselves to a room', () => {
    expect(isAssignable(participant({ kind: ParticipantKind.SIP }))).toBe(false)
    expect(isAssignable(participant({ kind: ParticipantKind.AGENT }))).toBe(
      false
    )
    expect(isAssignable(participant({ kind: ParticipantKind.EGRESS }))).toBe(
      false
    )
  })

  it('offers the hosts, this browser included', () => {
    expect(isAssignable(participant({ isLocal: true }))).toBe(true)
    expect(
      isAssignable(participant({ attributes: { room_role: 'owner' } }))
    ).toBe(true)
  })
})

describe('shuffleAssignments', () => {
  it('spreads everyone evenly over the rooms', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    const assignments = shuffleAssignments(ids, 2)
    expect(Object.keys(assignments).sort()).toEqual(ids)
    const sizes = [0, 1].map(
      (room) => Object.values(assignments).filter((r) => r === room).length
    )
    expect(sizes.sort()).toEqual([2, 3])
  })

  it('draws the order from the random source', () => {
    expect(shuffleAssignments(['a', 'b', 'c'], 3, () => 0)).toEqual({
      b: 0,
      c: 1,
      a: 2,
    })
  })
})

describe('buildRooms', () => {
  it('puts each present person in their room by identity and drops the others', () => {
    const people = [
      { identity: 'alice', name: 'Alice' },
      { identity: 'bob', name: 'Bob' },
      { identity: 'carol', name: 'Carol' },
    ]
    const assignments = { alice: 1, bob: 0, carol: 2, dave: 0 }
    expect(buildRooms(['Room 1', 'Room 2'], people, assignments)).toEqual([
      { name: 'Room 1', participants: [{ identity: 'bob' }] },
      { name: 'Room 2', participants: [{ identity: 'alice' }] },
    ])
  })
})
