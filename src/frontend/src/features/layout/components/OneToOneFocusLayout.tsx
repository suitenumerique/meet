import { memo } from 'react'
import type { TrackReferenceOrPlaceholder } from '@livekit/components-core'
import { styled } from '@/styled-system/jsx'
import { cva } from '@/styled-system/css'
import { ParticipantTile } from '@/features/participantTile/components/ParticipantTile'
import { getTrackKey } from '@/features/layout/utils/trackSelection'
import { GridLayout } from '@/features/layout/components/GridLayout'

type OneToOneFocusLayoutProps = {
  mainTrack?: TrackReferenceOrPlaceholder
  mainTracks?: TrackReferenceOrPlaceholder[]
  thumbnailTrack?: TrackReferenceOrPlaceholder
  thumbnailMinimized?: boolean
  disableTileControls?: boolean
  /** Controls thumbnail dimensions – 'pip' for small PiP window, 'room' for the main viewport. */
  context?: 'pip' | 'room'
}

/**
 * Focus layout for 1-to-1 calls: one main tile filling the area (letterboxed)
 * with an optional thumbnail overlay at the bottom-right. When the user keeps
 * their tile in the corner with more participants, remotes share the main area
 * as a grid.
 *
 * Shared between PiP and the main room – pass `disableTileControls` in PiP
 * where hover controls should be hidden.
 */
export const OneToOneFocusLayout = memo(
  ({
    mainTrack,
    mainTracks,
    thumbnailTrack,
    thumbnailMinimized = false,
    disableTileControls,
    context = 'room',
  }: OneToOneFocusLayoutProps) => {
    const resolvedMainTracks = mainTracks ?? (mainTrack ? [mainTrack] : [])

    return (
      <FocusContainer>
        {resolvedMainTracks.length === 1 && (
          <MainSlot letterbox>
            <ParticipantTile
              key={getTrackKey(resolvedMainTracks[0])}
              trackRef={resolvedMainTracks[0]}
              disableTileControls={disableTileControls}
            />
          </MainSlot>
        )}
        {resolvedMainTracks.length > 1 && (
          <MainSlot>
            <GridLayout
              tracks={resolvedMainTracks}
              style={{ height: '100%', padding: 0 }}
            >
              <ParticipantTile disableTileControls={disableTileControls} />
            </GridLayout>
          </MainSlot>
        )}
        {thumbnailTrack && (
          <Thumbnail context={context} minimized={thumbnailMinimized}>
            <ParticipantTile
              key={getTrackKey(thumbnailTrack)}
              trackRef={thumbnailTrack}
              disableTileControls={disableTileControls}
            />
          </Thumbnail>
        )}
      </FocusContainer>
    )
  }
)
OneToOneFocusLayout.displayName = 'OneToOneFocusLayout'

const FocusContainer = styled('div', {
  base: {
    position: 'relative',
    width: '100%',
    height: '100%',
    borderRadius: '8px',
    overflow: 'hidden',
    backgroundColor: 'primaryDark.100',
    boxSizing: 'border-box',
  },
})

const MainSlot = styled('div', {
  base: {
    width: '100%',
    height: '100%',
    borderRadius: '8px',
    overflow: 'hidden',
    minHeight: 0,
    '& .lk-participant-tile': {
      width: '100%',
      height: '100%',
    },
  },
  variants: {
    letterbox: {
      true: {
        '& .lk-participant-media-video': {
          objectFit: 'contain',
        },
      },
    },
  },
})

const Thumbnail = styled(
  'div',
  cva({
    base: {
      position: 'absolute',
      right: '1.25rem',
      bottom: '1.25rem',
      aspectRatio: '16 / 9',
      borderRadius: '8px',
      overflow: 'hidden',
      boxShadow: 'md',
      zIndex: 2,
      '& .lk-participant-tile': {
        width: '100%',
        height: '100%',
      },
    },
    variants: {
      context: {
        pip: {
          width: '42%',
          maxWidth: '220px',
          minWidth: '140px',
        },
        room: {
          width: '20%',
          maxWidth: '320px',
          minWidth: '180px',
        },
      },
      minimized: {
        true: {
          width: '14%',
          maxWidth: '180px',
          minWidth: '128px',
        },
      },
    },
    defaultVariants: {
      context: 'room',
    },
  })
)
