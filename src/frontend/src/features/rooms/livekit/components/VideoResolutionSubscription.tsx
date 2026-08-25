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
import { performanceModeStore } from '@/stores/performanceMode'

export const VideoResolutionSubscription = () => {
  const { videoSubscribeQuality } = useSnapshot(userChoicesStore)
  const { enabled: isPerformanceModeEnabled } =
    useSnapshot(performanceModeStore)
  const room = useRoomContext()

  const effectiveQuality = isPerformanceModeEnabled
    ? VideoQuality.LOW
    : (videoSubscribeQuality ?? VideoQuality.HIGH)

  useEffect(() => {
    if (!room) return

    const handleTrackPublished = (
      publication: RemoteTrackPublication,
      _participant: RemoteParticipant
    ) => {
      if (effectiveQuality === VideoQuality.HIGH) return
      if (
        publication.kind === Track.Kind.Video &&
        publication.source !== Track.Source.ScreenShare
      ) {
        publication.setVideoQuality(effectiveQuality)
      }
    }

    room.on(RoomEvent.TrackPublished, handleTrackPublished)
    return () => {
      room.off(RoomEvent.TrackPublished, handleTrackPublished)
    }
  }, [room, effectiveQuality])

  useEffect(() => {
    if (!room) return

    room.remoteParticipants.forEach((participant) => {
      participant.videoTrackPublications.forEach((publication) => {
        if (publication.source === Track.Source.ScreenShare) return
        if (publication.videoQuality !== effectiveQuality) {
          publication.setVideoQuality(effectiveQuality)
        }
      })
    })
  }, [room, effectiveQuality])

  return null
}
