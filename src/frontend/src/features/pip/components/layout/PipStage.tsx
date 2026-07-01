import React, { useMemo } from 'react'
import { usePagination, useTracks } from '@livekit/components-react'
import { RoomEvent, Track } from 'livekit-client'
import { styled } from '@/styled-system/jsx'
import { PipFocusLayout } from './PipFocusLayout'
import { PipGridLayout } from './PipGridLayout'
import { PipPagination } from './PipPagination'
import { PipScreenShareLayout } from './PipScreenShareLayout'
import { StageFrame } from './StageFrame'
import { MAX_PIP_TILES } from '../../utils/pipGrid'
import {
  isTrackReference,
  TrackReferenceOrPlaceholder,
} from '@livekit/components-core'

/**
 * PipStage picks between three layouts:
 *   - Screen share mode (any screen share active):
 *     small camera tiles in a row at the top, large screen share below.
 *   - Grid mode  (3+ camera tracks, no screen share): adaptive tiling.
 *   - Focus mode (≤ 2 camera tracks, no screen share): one main track
 *     + one thumbnail overlay.
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

  // Cap camera tiles in screen-share mode. Called unconditionally for hook rules.
  const paginatedCameraTracks = usePagination(MAX_PIP_TILES - 1, cameraTracks)

  // Cap the grid at MAX_PIP_TILES per page for the non-screenshare grid mode.
  const pagination = usePagination(MAX_PIP_TILES, cameraTracks)

  if (tracks.length === 0) return null

  // Screen share active → Google Meet-style layout
  if (screenShareTrack) {
    return (
      <PaginatedStage pagination={paginatedCameraTracks}>
        <PipScreenShareLayout
          screenShareTrack={screenShareTrack}
          cameraTracks={paginatedCameraTracks.tracks}
        />
      </PaginatedStage>
    )
  }

  // 3+ camera tracks → adaptive grid
  if (cameraTracks.length > 2) {
    return (
      <PaginatedStage pagination={pagination}>
        <PipGridLayout tracks={pagination.tracks} />
      </PaginatedStage>
    )
  }

  // ≤ 2 camera tracks → focus layout (main + optional thumbnail)
  const localCameraTrack = cameraTracks.find(
    (track) => track.participant?.isLocal
  )
  const remoteCameraTrack = cameraTracks.find(
    (track) => !track.participant?.isLocal
  )
  const mainTrack = remoteCameraTrack ?? localCameraTrack
  const thumbnailTrack =
    mainTrack === localCameraTrack ? undefined : localCameraTrack

  return (
    <StageFrame>
      <PipFocusLayout mainTrack={mainTrack} thumbnailTrack={thumbnailTrack} />
    </StageFrame>
  )
}

type PaginationResult = {
  totalPageCount: number
  currentPage: number
  nextPage: () => void
  prevPage: () => void
}

const PaginatedStage = ({
  pagination,
  children,
}: {
  pagination: PaginationResult
  children: React.ReactNode
}) => (
  <StageWrapper>
    <StageFrame>{children}</StageFrame>
    <PipPagination
      totalPageCount={pagination.totalPageCount}
      currentPage={pagination.currentPage}
      nextPage={pagination.nextPage}
      prevPage={pagination.prevPage}
    />
  </StageWrapper>
)

const StageWrapper = styled('div', {
  base: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    minHeight: 0,
  },
})
