import { useEffect } from 'react'
import { useRoomContext } from '@livekit/components-react'
import {
  type RemoteParticipant,
  type RemoteTrackPublication,
  RoomEvent,
  Track,
  VideoQuality,
} from 'livekit-client'
import { useSnapshot } from 'valtio'
import { userChoicesStore } from '@/stores/userChoices'

/**
 * Sets initial video quality for new participants as they join.
 * LiveKit doesn't allow handling video quality preferences at the room level.
 */
export const VideoResolutionSubscription = () => {
  const { videoSubscribeQuality } = useSnapshot(userChoicesStore)
  const room = useRoomContext()

  useEffect(() => {
    if (!room) return

    const handleTrackPublished = (
      publication: RemoteTrackPublication,
      _participant: RemoteParticipant
    ) => {
      // By default, the maximum quality is set to high
      if (
        videoSubscribeQuality === undefined ||
        videoSubscribeQuality === VideoQuality.HIGH
      )
        return

      if (
        publication.kind === Track.Kind.Video &&
        publication.source !== Track.Source.ScreenShare
      ) {
        publication.setVideoQuality(videoSubscribeQuality)
      }
    }

    room.on(RoomEvent.TrackPublished, handleTrackPublished)
    return () => {
      room.off(RoomEvent.TrackPublished, handleTrackPublished)
    }
  }, [room, videoSubscribeQuality])

  return null
}
