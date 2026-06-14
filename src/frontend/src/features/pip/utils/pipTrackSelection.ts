import {
  isTrackReference,
  TrackReferenceOrPlaceholder,
} from '@livekit/components-core'

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
