import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation('rooms', {
    keyPrefix: 'options.items.pictureInPicture',
  })
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  )

  const screenShareTrack = useMemo(() => pickScreenShareTrack(tracks), [tracks])

  // Order the list so the "focus target" (screen share when available,
  // otherwise a remote camera) is first. Both layouts consume this order.
  const stageTracks = useMemo(() => {
    const cameraTracks = tracks.filter(isCameraTrack)
    if (!screenShareTrack) return cameraTracks
    return [screenShareTrack, ...cameraTracks]
  }, [tracks, screenShareTrack])

  // avoid tabbing to the stage when it's not visible
  const frameRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    frameRef.current?.setAttribute('inert', '')
  }, [])

  if (stageTracks.length === 0) return null

  const stageLabel = t('stage')

  if (stageTracks.length > FOCUS_MAX_TILES) {
    return (
      <StageFrame ref={frameRef} role="region" aria-label={stageLabel}>
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
    <StageFrame ref={frameRef} role="region" aria-label={stageLabel}>
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
