import {
  isEqualTrackRef,
  isTrackReference,
  type TrackReferenceOrPlaceholder,
} from '@livekit/components-core'
import { Track } from 'livekit-client'

export function getSubscribedScreenShareTracks(
  tracks: TrackReferenceOrPlaceholder[]
): TrackReferenceOrPlaceholder[] {
  return tracks
    .filter(isTrackReference)
    .filter(
      (track) =>
        track.publication.source === Track.Source.ScreenShare &&
        track.publication.isSubscribed
    )
}

export function getNewScreenShareTracks(
  screenShareTracks: TrackReferenceOrPlaceholder[],
  knownTrackSids: Set<string>
): TrackReferenceOrPlaceholder[] {
  return screenShareTracks.filter(
    (track) =>
      track.publication.trackSid &&
      !knownTrackSids.has(track.publication.trackSid)
  )
}

export function syncKnownScreenShareSids(
  screenShareTracks: TrackReferenceOrPlaceholder[],
  knownTrackSids: Set<string>
): void {
  const currentSids = new Set(
    screenShareTracks
      .map((track) => track.publication.trackSid)
      .filter((sid): sid is string => !!sid)
  )

  screenShareTracks.forEach((track) => {
    if (track.publication.trackSid) {
      knownTrackSids.add(track.publication.trackSid)
    }
  })

  knownTrackSids.forEach((sid) => {
    if (!currentSids.has(sid)) {
      knownTrackSids.delete(sid)
    }
  })
}

export function getNewestScreenShareTrack(
  screenShareTracks: TrackReferenceOrPlaceholder[]
): TrackReferenceOrPlaceholder | undefined {
  if (screenShareTracks.length === 0) return undefined
  return screenShareTracks[screenShareTracks.length - 1]
}

export function splitTracksForFocusLayout(
  tracks: TrackReferenceOrPlaceholder[],
  focusTrack: TrackReferenceOrPlaceholder | undefined,
  screenShareTracks: TrackReferenceOrPlaceholder[]
): {
  carouselTracks: TrackReferenceOrPlaceholder[]
  secondaryScreenShareTracks: TrackReferenceOrPlaceholder[]
} {
  const hasActiveScreenShares = screenShareTracks.length > 0

  const secondaryScreenShareTracks = screenShareTracks.filter(
    (track) => !focusTrack || !isEqualTrackRef(track, focusTrack)
  )

  const carouselTracks = tracks.filter((track) => {
    if (focusTrack && isEqualTrackRef(track, focusTrack)) return false
    if (hasActiveScreenShares && track.source === Track.Source.ScreenShare) {
      return false
    }
    return true
  })

  return { carouselTracks, secondaryScreenShareTracks }
}
