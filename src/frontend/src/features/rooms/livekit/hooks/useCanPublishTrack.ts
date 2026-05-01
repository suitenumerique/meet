import { TrackSource } from '@livekit/protocol'
import { Track } from 'livekit-client'
import {
  useLocalParticipant,
  useParticipantPermissions,
} from '@livekit/components-react'

/**
 * Maps livekit-client Track.Source (string enum) to
 * @livekit/protocol TrackSource (numeric enum) used by permissions.
 */
const trackSourceToProtocol: Record<string, TrackSource> = {
  [Track.Source.Camera]: TrackSource.CAMERA,
  [Track.Source.Microphone]: TrackSource.MICROPHONE,
  [Track.Source.ScreenShare]: TrackSource.SCREEN_SHARE,
  [Track.Source.ScreenShareAudio]: TrackSource.SCREEN_SHARE_AUDIO,
}

export function useCanPublishTrack(source: Track.Source): boolean {
  const { localParticipant } = useLocalParticipant()
  const permissions = useParticipantPermissions({
    participant: localParticipant,
  })

  const protocolSource = trackSourceToProtocol[source]

  return Boolean(
    permissions?.canPublish &&
    protocolSource !== undefined &&
    permissions?.canPublishSources?.includes(protocolSource)
  )
}
