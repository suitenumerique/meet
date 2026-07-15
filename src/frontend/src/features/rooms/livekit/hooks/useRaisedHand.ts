import { Participant, RoomEvent } from 'livekit-client'
import {
  useRoomContext,
  useParticipantAttribute,
  useParticipantInfo,
  useRemoteParticipants,
} from '@livekit/components-react'
import { isLocal } from '@/utils/livekit'
import { useMemo } from 'react'
import { useRaiseHand } from '@/features/rooms/api/updateRaiseHand'

type useRaisedHandProps = {
  participant: Participant
}

export function useRaisedHandPosition({ participant }: useRaisedHandProps) {
  const room = useRoomContext()
  const { identity } = useParticipantInfo({ participant })
  const localIdentity = room.localParticipant.identity

  const localHandRaisedAt = useParticipantAttribute('handRaisedAt', {
    participant: room.localParticipant,
  })

  const remoteParticipants = useRemoteParticipants({
    updateOnlyOn: [RoomEvent.ParticipantAttributesChanged],
  })

  const raisedHands = useMemo(() => {
    const byIdentity = new Map<string, number>()

    const add = (id: string, value?: string) => {
      const time = new Date(value ?? '').getTime()
      if (Number.isNaN(time)) return
      const existing = byIdentity.get(id)
      if (existing === undefined || time < existing) byIdentity.set(id, time)
    }

    if (localIdentity) add(localIdentity, localHandRaisedAt)

    remoteParticipants.forEach((p) =>
      add(p.identity, p.attributes.handRaisedAt)
    )

    return byIdentity
  }, [remoteParticipants, localIdentity, localHandRaisedAt])

  const sortedHands = useMemo(
    () =>
      [...raisedHands.entries()]
        .map(([identity, time]) => ({ identity, time }))
        .sort(
          (a, b) => a.time - b.time || a.identity.localeCompare(b.identity)
        ),
    [raisedHands]
  )

  const positionInQueue = useMemo(() => {
    const index = sortedHands.findIndex((h) => h.identity === identity)
    return index === -1 ? undefined : index + 1
  }, [sortedHands, identity])

  return {
    positionInQueue,
    firstInQueue: positionInQueue === 1,
  }
}

export function useRaisedHand({ participant }: useRaisedHandProps) {
  const handRaisedAtAttribute = useParticipantAttribute('handRaisedAt', {
    participant,
  })
  const { raiseHand } = useRaiseHand()

  const isHandRaised = !!handRaisedAtAttribute

  const toggleRaisedHand = async () => {
    if (!isLocal(participant)) return
    try {
      await raiseHand(!isHandRaised)
    } catch (e) {
      console.error(
        `Failed to toggle hand: ${e instanceof Error ? e.message : 'Unknown error'}`
      )
    }
  }

  return { isHandRaised, toggleRaisedHand }
}
