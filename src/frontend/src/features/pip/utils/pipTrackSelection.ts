import {
  isTrackReference,
  TrackReferenceOrPlaceholder,
} from '@livekit/components-core'
import { Track } from 'livekit-client'

/**
 * Helpers used by the PiP layouts to classify/pick tracks.
 * Kept free of React so they are trivially testable and cheap to call.
 */

export const pickScreenShareTrack = (
  tracks: TrackReferenceOrPlaceholder[]
): TrackReferenceOrPlaceholder | undefined =>
  tracks
    .filter((track) => isTrackReference(track))
    .find((track) => track.publication.source === Track.Source.ScreenShare)

export const pickLocalCameraTrack = (
  tracks: TrackReferenceOrPlaceholder[]
): TrackReferenceOrPlaceholder | undefined =>
  tracks.find(
    (track) =>
      track.source === Track.Source.Camera && track.participant?.isLocal
  )

export const pickRemoteCameraTrack = (
  tracks: TrackReferenceOrPlaceholder[]
): TrackReferenceOrPlaceholder | undefined =>
  tracks.find(
    (track) =>
      track.source === Track.Source.Camera && !track.participant?.isLocal
  )

export const isCameraTrack = (track: TrackReferenceOrPlaceholder): boolean =>
  track.source === Track.Source.Camera

/**
 * Produces a stable React key for a track so resizes/reshuffles of the grid
 * do not remount the underlying <video> element.
 */
export const getTrackKey = (track: TrackReferenceOrPlaceholder): string => {
  const identity = track.participant?.identity ?? 'unknown'
  if (isTrackReference(track)) {
    return `${identity}::${track.source}::${track.publication.trackSid}`
  }
  return `${identity}::${track.source}::placeholder`
}
