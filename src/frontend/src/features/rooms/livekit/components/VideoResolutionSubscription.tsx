import { useEffect } from 'react'
import { useRoomContext } from '@livekit/components-react'
import {
  type RemoteTrack,
  type RemoteTrackPublication,
  RoomEvent,
  Track,
} from 'livekit-client'
import { useSnapshot } from 'valtio'
import { userChoicesStore } from '@/stores/userChoices'

/**
 * Applies the saved reception quality to every remote camera.
 * LiveKit doesn't allow handling video quality preferences at the room level.
 */
export const VideoResolutionSubscription = () => {
  const { videoSubscribeQuality } = useSnapshot(userChoicesStore)
  const room = useRoomContext()

  useEffect(() => {
    if (!room || videoSubscribeQuality === undefined) return

    const applyQuality = (publication: RemoteTrackPublication) => {
      if (
        publication.kind !== Track.Kind.Video ||
        publication.source === Track.Source.ScreenShare ||
        publication.videoQuality === videoSubscribeQuality
      ) {
        return
      }
      publication.setVideoQuality(videoSubscribeQuality)
    }

    // Cameras we are already receiving: those published before this effect ran,
    // and all of them again whenever the preference changes mid-call.
    room.remoteParticipants.forEach((participant) =>
      participant.videoTrackPublications.forEach(applyQuality)
    )

    const handleTrackPublished = (publication: RemoteTrackPublication) =>
      applyQuality(publication)

    // TrackPublished is not raised for cameras that were already sending when we
    // joined, but it is the earliest point for the ones that start after us.
    const handleTrackSubscribed = (
      _track: RemoteTrack,
      publication: RemoteTrackPublication
    ) => applyQuality(publication)

    room.on(RoomEvent.TrackPublished, handleTrackPublished)
    room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed)
    return () => {
      room.off(RoomEvent.TrackPublished, handleTrackPublished)
      room.off(RoomEvent.TrackSubscribed, handleTrackSubscribed)
    }
  }, [room, videoSubscribeQuality])

  return null
}
