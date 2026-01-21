import { styled } from '@/styled-system/jsx'
import { supportsScreenSharing } from '@livekit/components-core'
import {
  isTrackReference,
  TrackReferenceOrPlaceholder,
} from '@livekit/components-core'
import { useTracks } from '@livekit/components-react'
import { Track } from 'livekit-client'
import { AudioDevicesControl } from './controls/Device/AudioDevicesControl'
import { VideoDeviceControl } from './controls/Device/VideoDeviceControl'
import { ScreenShareToggle } from './controls/ScreenShareToggle'
import { LeaveButton } from './controls/LeaveButton'
import { ParticipantTile } from './ParticipantTile'
import { GridLayout } from './layout/GridLayout'
import { ReactionsToggle } from './controls/ReactionsToggle'
import { SubtitlesToggle } from './controls/SubtitlesToggle'
import { HandToggle } from './controls/HandToggle'
import { OptionsButton } from './controls/Options/OptionsButton'
import { StartMediaButton } from './controls/StartMediaButton'
import { SidePanel } from './SidePanel'

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
          <GridLayout tracks={tracks} style={{ height: '100%' }}>
            <ParticipantTile disableMetadata />
          </GridLayout>
        ) : (
          <ParticipantTile trackRef={trackRef} disableMetadata />
        )}
      </PipStage>
      {/* Compact control bar for PiP; extend here when adding more actions. */}
      <PipControlsBar
        showScreenShare={browserSupportsScreenSharing}
      />
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

const PipControls = styled('div', {
  base: {
    flex: '0 0 auto',
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: '0.4rem',
    padding: '0.5rem 0.75rem',
    backgroundColor: 'var(--lk-controlbar-bg)',
    borderTop: '1px solid',
    borderColor: 'var(--lk-control-border-color)',
  },
})

const PipControlsBar = ({
  showScreenShare,
}: {
  showScreenShare: boolean
}) => (
  <PipControls>
    <AudioDevicesControl hideMenu />
    <VideoDeviceControl hideMenu />
    <ReactionsToggle />
    {showScreenShare && <ScreenShareToggle />}
    <SubtitlesToggle />
    <HandToggle />
    <OptionsButton />
    <LeaveButton />
    <StartMediaButton />
  </PipControls>
)

