import { useMemo } from 'react'
import { useTracks } from '@livekit/components-react'
import { RoomEvent, Track } from 'livekit-client'
import { PipFocusLayout } from './PipFocusLayout'
import { PipGridLayout } from './PipGridLayout'
import { StageFrame } from './StageFrame'
import {
  isTrackReference,
  TrackReferenceOrPlaceholder,
} from '@livekit/components-core'

/**
 * PipStage picks between two layouts based on track count:
 *   - Focus mode (≤ 2 tracks): one main track + one thumbnail overlay.
 *   - Grid mode  (3+ tracks):  adaptive tiling.
 */
export const PipStage = () => {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { updateOnlyOn: [RoomEvent.ActiveSpeakersChanged], onlySubscribed: false }
  )

  const screenShareTrack = useMemo(() => {
    return tracks
      .filter((track) => isTrackReference(track))
      .find((track) => track.publication.source === Track.Source.ScreenShare)
  }, [tracks])

  const cameraTracks = useMemo(
    () =>
      tracks.filter(
        (track: TrackReferenceOrPlaceholder) =>
          track.source === Track.Source.Camera
      ),
    [tracks]
  )

  if (tracks.length === 0) return null

  /**
   * The focus layout shows one main track with one thumbnail overlay,
   * so it can only fit 2 tracks. Beyond that we switch to the grid.
   */
  if (tracks.length > 2) {
    // Grid mode: 3+ tracks. Screen share goes first so it leads the grid.
    const gridTracks = screenShareTrack
      ? [screenShareTrack, ...cameraTracks]
      : cameraTracks
    return (
      <StageFrame>
        <PipGridLayout tracks={gridTracks} />
      </StageFrame>
    )
  }

  const localCameraTrack = cameraTracks.find(
    (track) => track.participant?.isLocal
  )

  const remoteCameraTrack = cameraTracks.find(
    (track) => !track.participant?.isLocal
  )

  const mainTrack = screenShareTrack ?? remoteCameraTrack ?? localCameraTrack

  const thumbnailTrack =
    mainTrack === localCameraTrack ? undefined : localCameraTrack

  return (
    <StageFrame>
      <PipFocusLayout mainTrack={mainTrack} thumbnailTrack={thumbnailTrack} />
    </StageFrame>
  )
}
