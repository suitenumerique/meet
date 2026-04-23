import { useMemo } from 'react'
import { useTracks } from '@livekit/components-react'
import { Track } from 'livekit-client'
import { styled } from '@/styled-system/jsx'
import {
  isCameraTrack,
  pickLocalCameraTrack,
  pickRemoteCameraTrack,
  pickScreenShareTrack,
} from '../../utils/pipTrackSelection'
import { PipFocusLayout } from './PipFocusLayout'
import { PipGridLayout } from './PipGridLayout'

/**
 * Above this count the PiP stage switches from the focus layout
 * (main + thumbnail) to the adaptive grid layout.
 */
const FOCUS_MAX_TILES = 2
 
// Handles which layout to render inside the PiP stage.

export const PipStage = () => {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  )

  const screenShareTrack = useMemo(
    () => pickScreenShareTrack(tracks),
    [tracks]
  )

  // Order the list so the "focus target" (screen share when available,
  // otherwise a remote camera) is first. Both layouts consume this order.
  const stageTracks = useMemo(() => {
    const cameraTracks = tracks.filter(isCameraTrack)
    if (!screenShareTrack) return cameraTracks
    return [screenShareTrack, ...cameraTracks]
  }, [tracks, screenShareTrack])

  if (stageTracks.length === 0) return null

  if (stageTracks.length > FOCUS_MAX_TILES) {
    return (
      <StageFrame>
        <PipGridLayout tracks={stageTracks} />
      </StageFrame>
    )
  }

  const localCameraTrack = pickLocalCameraTrack(stageTracks)
  const remoteCameraTrack = pickRemoteCameraTrack(stageTracks)
  const mainTrack = screenShareTrack ?? remoteCameraTrack ?? stageTracks[0]
  const thumbnailTrack =
    localCameraTrack && localCameraTrack !== mainTrack
      ? localCameraTrack
      : stageTracks.find((track) => track !== mainTrack)

  return (
    <StageFrame>
      <PipFocusLayout mainTrack={mainTrack} thumbnailTrack={thumbnailTrack} />
    </StageFrame>
  )
}

const StageFrame = styled('div', {
  base: {
    position: 'relative',
    minWidth: 0,
    minHeight: 0,
    margin: '0.5rem',
    borderRadius: 'lg',
    overflow: 'hidden',
  },
})
