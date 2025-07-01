import { LocalParticipant, Participant } from 'livekit-client'
import { useParticipantInfo } from '@livekit/components-react'
import { isLocal } from '@/utils/livekit'

type useRaisedHandProps = {
  participant: Participant
}

export function useRaisedHand({ participant }: useRaisedHandProps) {
  // fixme - refactor this part to rely on attributes
  const { metadata } = useParticipantInfo({ participant })
  const parsedMetadata = JSON.parse(metadata || '{}')

  const toggleRaisedHand = () => {
    if (isLocal(participant)) {
      parsedMetadata.raised = !parsedMetadata.raised
      const localParticipant = participant as LocalParticipant
      localParticipant.setMetadata(JSON.stringify(parsedMetadata))
    }
  }

  return { isHandRaised: parsedMetadata.raised ?? false, toggleRaisedHand }
}
