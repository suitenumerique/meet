import { styled } from '@/styled-system/jsx'
import { supportsScreenSharing } from '@livekit/components-core'
import {
  isTrackReference,
  TrackReferenceOrPlaceholder,
} from '@livekit/components-core'
import { useTracks } from '@livekit/components-react'
import { Track } from 'livekit-client'
import { ParticipantTile } from '@/features/rooms/livekit/components/ParticipantTile'
import { SidePanel } from '@/features/rooms/livekit/components/SidePanel'
import { pipLayoutStore } from '../stores/pipLayoutStore'
import { PipControlBar } from './PipControlBar'
import { PipReactionsToolbar } from './PipReactionsToolbar'

const pickTrackForPip = (
  tracks: TrackReferenceOrPlaceholder[]
): TrackReferenceOrPlaceholder | undefined => {
  // Prefer screen share when present; otherwise fallback to first available track.
  const screenShareTrack = tracks
    .filter((track) => isTrackReference(track))
    .find((track) => track.publication.source === Track.Source.ScreenShare)

  if (screenShareTrack) return screenShareTrack
  return tracks[0]
}

const pickLocalCameraTrack = (
  tracks: TrackReferenceOrPlaceholder[]
): TrackReferenceOrPlaceholder | undefined =>
  tracks.find(
    (track) =>
      track.source === Track.Source.Camera && track.participant?.isLocal
  )

const pickRemoteCameraTrack = (
  tracks: TrackReferenceOrPlaceholder[]
): TrackReferenceOrPlaceholder | undefined =>
  tracks.find(
    (track) =>
      track.source === Track.Source.Camera && !track.participant?.isLocal
  )

/**
 * Main view component for the Picture-in-Picture window.
 * Handles track selection (prioritizes screen share), layout switching (grid for multiple participants),
 * and renders the control bar and side panel within the PiP window.
 */
export const PipView = () => {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  )

  const trackRef = pickTrackForPip(tracks)
  const browserSupportsScreenSharing = supportsScreenSharing()
  const hasMultipleTiles = tracks.length > 1
  const localCameraTrack = pickLocalCameraTrack(tracks)
  const remoteCameraTrack = pickRemoteCameraTrack(tracks)
  const mainTrackRef = remoteCameraTrack ?? trackRef
  const thumbnailTrackRef =
    mainTrackRef && localCameraTrack && localCameraTrack !== mainTrackRef
      ? localCameraTrack
      : tracks.find((track) => track !== mainTrackRef)

  if (!trackRef && !hasMultipleTiles) return null

  return (
    <PipContainer>
      {/* Keep stage height stable to avoid layout shifting on track changes. */}
      <PipStage>
        {hasMultipleTiles ? (
          <>
            {mainTrackRef && (
              <ParticipantTile trackRef={mainTrackRef} disableMetadata />
            )}
            {thumbnailTrackRef && (
              <PipThumbnail>
                <ParticipantTile trackRef={thumbnailTrackRef} disableMetadata />
              </PipThumbnail>
            )}
          </>
        ) : (
          <ParticipantTile trackRef={trackRef} disableMetadata />
        )}
      </PipStage>
      <PipReactionsToolbar />
      <PipControlBar showScreenShare={browserSupportsScreenSharing} />
      {/* Side panel (effects, settings, etc.) opens within PiP window. */}
      <SidePanel store={pipLayoutStore} />
    </PipContainer>
  )
}

const PipContainer = styled('div', {
  base: {
    width: '100%',
    height: '100%',
    display: 'grid',
    gridTemplateRows: 'minmax(0, 1fr) auto auto',
    backgroundColor: 'primaryDark.50',
    '& .lk-participant-tile': {
      height: '100%',
    },
    '& .lk-participant-media': {
      height: '100%',
    },
    '& .lk-participant-media-video': {
      height: '100%',
      objectFit: 'cover',
    },
    '& .lk-grid-layout': {
      height: '100%',
      width: '100%',
    },
  },
})

const PipStage = styled('div', {
  base: {
    position: 'relative',
    minHeight: 0,
    margin: '0.5rem',
    borderRadius: 'lg',
    overflow: 'hidden',
  },
})

const PipThumbnail = styled('div', {
  base: {
    position: 'absolute',
    right: '1rem',
    bottom: '1rem',
    width: '42%',
    maxWidth: '220px',
    minWidth: '140px',
    aspectRatio: '16 / 9',
    borderRadius: 'md',
    overflow: 'hidden',
    boxShadow: 'md',
    zIndex: 2,
  },
})
