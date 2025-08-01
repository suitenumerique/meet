import { LocalParticipant, Participant } from 'livekit-client'
import {
  useParticipantAttribute,
  useParticipants,
} from '@livekit/components-react'
import { isLocal } from '@/utils/livekit'
import { useMemo } from 'react'

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

  const isHandRaised = !!handRaisedAtAttribute

  const toggleRaisedHand = async () => {
    if (!isLocal(participant)) return
    const localParticipant = participant as LocalParticipant

    const attributes: Record<string, string> = {
      handRaisedAt: !isHandRaised ? new Date().toISOString() : '',
    }

    await localParticipant.setAttributes(attributes)
  }

  return { isHandRaised, toggleRaisedHand }
}
