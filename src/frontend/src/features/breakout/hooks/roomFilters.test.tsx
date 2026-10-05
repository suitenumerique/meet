// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, renderHook, screen } from '@testing-library/react'
import { ParticipantsCount } from '@/features/participants/components/ParticipantsCount'
import { useNotifyParticipants } from '@/features/notifications/hooks/useNotifyParticipants'
import { NotificationType } from '@/features/notifications/NotificationType'

/* eslint-disable @typescript-eslint/no-explicit-any */
const h = vi.hoisted(() => ({ metadata: '', room: undefined as any }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count: number }) => `${key} ${options?.count}`,
  }),
}))
vi.mock('@livekit/components-react', () => ({
  useRoomContext: () => h.room,
  useRoomInfo: () => ({ metadata: h.metadata }),
  useRemoteParticipants: () => [
    { identity: 'bob', kind: 0 },
    { identity: 'carol', kind: 0 },
    { identity: 'host', kind: 0 },
  ],
}))

const split = JSON.stringify({
  breakout: {
    session_id: 's1',
    rooms: ['Room 1', 'Room 2'],
    assignments: { alice: 0, bob: 0, carol: 1 },
  },
})

const setUp = (metadata: string) => {
  h.metadata = metadata
  h.room = {
    metadata,
    localParticipant: { identity: 'alice', publishData: vi.fn() },
    remoteParticipants: new Map(
      ['bob', 'carol', 'host'].map((identity) => [
        identity,
        { identity, kind: 0 },
      ])
    ),
  }
}

afterEach(cleanup)

describe('in a split', () => {
  it('counts the people of this browser’s room only', () => {
    setUp(split)
    render(<ParticipantsCount describedById="count" />)
    expect(screen.getByText('count 2')).toBeTruthy()
  })

  it('sends an unaddressed notification to the room only', async () => {
    setUp(split)
    const { result } = renderHook(() => useNotifyParticipants())
    await result.current.notifyParticipants({
      type: NotificationType.ReactionReceived,
    })
    expect(h.room.localParticipant.publishData).toHaveBeenCalledWith(
      expect.anything(),
      { reliable: true, destinationIdentities: ['bob'] }
    )
  })

  it('keeps an addressed notification as addressed', async () => {
    setUp(split)
    const { result } = renderHook(() => useNotifyParticipants())
    await result.current.notifyParticipants({
      type: NotificationType.ParticipantMuted,
      destinationIdentities: ['carol'],
    })
    expect(h.room.localParticipant.publishData).toHaveBeenCalledWith(
      expect.anything(),
      { reliable: true, destinationIdentities: ['carol'] }
    )
  })
})

describe('outside a split', () => {
  it('counts everyone and notifies everyone', async () => {
    setUp('')
    render(<ParticipantsCount describedById="count" />)
    expect(screen.getByText('count 4')).toBeTruthy()
    const { result } = renderHook(() => useNotifyParticipants())
    await result.current.notifyParticipants({
      type: NotificationType.ReactionReceived,
    })
    expect(h.room.localParticipant.publishData).toHaveBeenCalledWith(
      expect.anything(),
      { reliable: true, destinationIdentities: undefined }
    )
  })
})
