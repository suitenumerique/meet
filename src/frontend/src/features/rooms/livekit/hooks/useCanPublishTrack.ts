import type { TrackSource } from '@livekit/protocol'
import { useLocalParticipantPermissions } from '@livekit/components-react'

export function useCanPublishTrack(trackSource: TrackSource): boolean {
  const permissions = useLocalParticipantPermissions()
  return Boolean(
    permissions?.canPublish &&
    permissions?.canPublishSources?.includes(trackSource)
  )
}
