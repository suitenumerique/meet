import type { TrackReferenceOrPlaceholder } from '@livekit/components-core'
import type { SelfTileLayout } from '@/stores/layout'

const remoteTracks = (cameraTracks: TrackReferenceOrPlaceholder[]) =>
  cameraTracks.filter((track) => !track.participant?.isLocal)

/**
 * Focus layout (main area + optional local thumbnail) instead of the original grid.
 * Pin and screen share are handled by the caller: they take the stage over this.
 */
export const shouldUseFocusLayout = (
  layout: SelfTileLayout,
  cameraTracks: TrackReferenceOrPlaceholder[]
): boolean => {
  if (layout === 'classic') return false
  if (layout === 'corner') return true
  return cameraTracks.length <= 2
}

export const hasRemoteCamera = (cameraTracks: TrackReferenceOrPlaceholder[]) =>
  remoteTracks(cameraTracks).length > 0

export const splitFocusTracks = (
  cameraTracks: TrackReferenceOrPlaceholder[]
) => {
  const local = cameraTracks.find((track) => track.participant?.isLocal)
  const remotes = remoteTracks(cameraTracks)
  return {
    mainTracks: remotes.length > 0 ? remotes : local ? [local] : [],
    thumbnailTrack: remotes.length > 0 ? local : undefined,
  }
}
