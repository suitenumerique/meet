import { styled } from '@/styled-system/jsx'
import { supportsScreenSharing } from '@livekit/components-core'
import {
  isTrackReference,
  TrackReferenceOrPlaceholder,
} from '@livekit/components-core'
import { useTracks } from '@livekit/components-react'
import { Track } from 'livekit-client'
import { ParticipantTile } from './ParticipantTile'
import { GridLayout } from './layout/GridLayout'
import { SidePanel } from './SidePanel'
import { PipControlBar } from './PipControlBar'

const pickTrackForPip = (
  tracks: TrackReferenceOrPlaceholder[]
): TrackReferenceOrPlaceholder | undefined => {
  // Prefer screen share when present; otherwise fallback to first available track.
  const screenShareTrack = tracks
    .filter(isTrackReference)
    .find((track) => track.publication.source === Track.Source.ScreenShare)

  if (screenShareTrack) return screenShareTrack
  return tracks[0]
}

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

  if (!trackRef && !hasMultipleTiles) return null

  return (
    <PipContainer>
      {/* Keep stage height stable to avoid layout shifting on track changes. */}
      <PipStage>
        {hasMultipleTiles ? (
          <PipGridWrapper>
            <GridLayout tracks={tracks} style={{ height: '100%' }}>
              <ParticipantTile disableMetadata />
            </GridLayout>
          </PipGridWrapper>
        ) : (
          <ParticipantTile trackRef={trackRef} disableMetadata />
        )}
      </PipStage>
      {/* Compact control bar for PiP; extend here when adding more actions. */}
      <PipControlBar showScreenShare={browserSupportsScreenSharing} />
      {/* Side panel (effects, settings, etc.) opens within PiP window. */}
      <SidePanel />
    </PipContainer>
  )
}

const PipContainer = styled('div', {
  base: {
    width: '100%',
    height: '100%',
    display: 'grid',
    gridTemplateRows: 'minmax(0, 1fr) auto',
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
  },
})

const PipGridWrapper = styled('div', {
  base: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
})

