import { Participant } from 'livekit-client'
import {
  useParticipantAttribute,
  useParticipants,
} from '@livekit/components-react'
import { isLocal } from '@/utils/livekit'
import { useMemo } from 'react'
import { useRaiseHand } from '@/features/rooms/api/updateRaiseHand'

type useRaisedHandProps = {
  participant: Participant
}

export function useRaisedHandPosition({ participant }: useRaisedHandProps) {
  const { isHandRaised } = useRaisedHand({ participant })

  const participants = useParticipants()

  const positionInQueue = useMemo(() => {
    if (!isHandRaised) return

    return (
      participants
        .filter((p) => !!p.attributes.handRaisedAt)
        .sort((a, b) => {
          const dateA = new Date(a.attributes.handRaisedAt)
          const dateB = new Date(b.attributes.handRaisedAt)
          return dateA.getTime() - dateB.getTime()
        })
        .findIndex((p) => p.identity === participant.identity) + 1
    )
  }, [participants, participant, isHandRaised])

  return {
    positionInQueue,
    firstInQueue: positionInQueue == 1,
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
