import { LocalParticipant, Participant } from 'livekit-client'
import { useParticipantAttribute } from '@livekit/components-react'
import { isLocal } from '@/utils/livekit'

type useRaisedHandProps = {
  participant: Participant
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
