import { useMemo } from 'react'
import { usePagination, useTracks } from '@livekit/components-react'
import { RoomEvent, Track } from 'livekit-client'
import { styled } from '@/styled-system/jsx'
import { PipFocusLayout } from './PipFocusLayout'
import { PipGridLayout } from './PipGridLayout'
import { PipPagination } from './PipPagination'
import { StageFrame } from './StageFrame'
import { MAX_PIP_TILES } from '../../utils/pipGrid'
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

  // Grid mode order: screen share leads, then cameras (already ordered by
  // active speaker via the `ActiveSpeakersChanged` update above).
  const gridTracks = useMemo(
    () =>
      screenShareTrack ? [screenShareTrack, ...cameraTracks] : cameraTracks,
    [screenShareTrack, cameraTracks]
  )

  // Cap the grid at MAX_PIP_TILES per page. `usePagination` keeps the visible
  // page visually stable (active/recent speakers stay put) via its internal
  // `useVisualStableUpdate`. Called unconditionally to respect hook rules.
  const pagination = usePagination(MAX_PIP_TILES, gridTracks)

  if (tracks.length === 0) return null

  /**
   * The focus layout shows one main track with one thumbnail overlay,
   * so it can only fit 2 tracks. Beyond that we switch to the grid.
   */
  if (gridTracks.length > 2) {
    return (
      <StageWrapper>
        <StageFrame>
          <PipGridLayout tracks={pagination.tracks} />
        </StageFrame>
        <PipPagination
          totalPageCount={pagination.totalPageCount}
          currentPage={pagination.currentPage}
          nextPage={pagination.nextPage}
          prevPage={pagination.prevPage}
        />
      </StageWrapper>
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

const StageWrapper = styled('div', {
  base: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    minHeight: 0,
  },
})
