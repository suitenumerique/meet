import { useEffect } from 'react'
import { usePersistentUserChoices } from './usePersistentUserChoices'
import { useRoomContext } from '@livekit/components-react'
import {
  RemoteParticipant,
  RemoteTrackPublication,
  RoomEvent,
  Track,
  VideoQuality,
} from 'livekit-client'

/**
 * This hook sets initial video quality for new participants as they join.
 * LiveKit doesn't allow handling video quality preferences at the room level.
 */
export const useVideoResolutionSubscription = () => {
  const {
    userChoices: { videoSubscribeQuality },
  } = usePersistentUserChoices()

  const room = useRoomContext()

  useEffect(() => {
    if (!room) return
    const handleTrackPublished = (
      publication: RemoteTrackPublication,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
}
