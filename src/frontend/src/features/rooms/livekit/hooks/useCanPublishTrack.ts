import { TrackSource } from '@livekit/protocol'
import {
  useLocalParticipant,
  useParticipantPermissions,
} from '@livekit/components-react'

export function useCanPublishTrack(trackSource: TrackSource): boolean {
  const { localParticipant } = useLocalParticipant()
  const permissions = useParticipantPermissions({
    participant: localParticipant,
  })

  return Boolean(
    permissions?.canPublish &&
    permissions?.canPublishSources?.includes(trackSource)
  )
}
