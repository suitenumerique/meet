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

const pickTrackForPip = (
  tracks: TrackReferenceOrPlaceholder[]
): TrackReferenceOrPlaceholder | undefined => {
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

  if (!trackRef) return null

  return (
    <PipContainer>
      <PipStage>
        <ParticipantTile trackRef={trackRef} disableMetadata />
      </PipStage>
      <PipControlsBar
        showScreenShare={browserSupportsScreenSharing}
      />
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
    justifyContent: 'center',
    gap: '0.5rem',
    padding: '0.5rem',
    backgroundColor: 'primaryDark.100',
    borderTop: '1px solid',
    borderColor: 'primaryDark.200',
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
    {showScreenShare && <ScreenShareToggle />}
    <LeaveButton />
  </PipControls>
)

