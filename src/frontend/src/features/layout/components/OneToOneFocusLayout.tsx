import { memo } from 'react'
import type { TrackReferenceOrPlaceholder } from '@livekit/components-core'
import { styled } from '@/styled-system/jsx'
import { cva } from '@/styled-system/css'
import { ParticipantTile } from '@/features/rooms/livekit/components/ParticipantTile'
import { getTrackKey } from '@/features/layout/utils/trackSelection'

type OneToOneFocusLayoutProps = {
  mainTrack?: TrackReferenceOrPlaceholder
  thumbnailTrack?: TrackReferenceOrPlaceholder
  disableTileControls?: boolean
  /** Controls thumbnail dimensions – 'pip' for small PiP window, 'room' for the main viewport. */
  context?: 'pip' | 'room'
}

/**
 * Focus layout for 1-to-1 calls: one main tile filling the area (letterboxed)
 * with an optional thumbnail overlay at the bottom-right.
 *
 * Shared between PiP and the main room – pass `disableTileControls` in PiP
 * where hover controls should be hidden.
 */
export const OneToOneFocusLayout = memo(
  ({
    mainTrack,
    thumbnailTrack,
    disableTileControls,
    context = 'room',
  }: OneToOneFocusLayoutProps) => {
    return (
      <FocusContainer>
        {mainTrack && (
          <MainSlot>
            <ParticipantTile
              key={getTrackKey(mainTrack)}
              trackRef={mainTrack}
              disableTileControls={disableTileControls}
            />
          </MainSlot>
        )}
        {thumbnailTrack && (
          <Thumbnail context={context}>
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
    '& .lk-participant-tile': {
      width: '100%',
      height: '100%',
    },
    '& .lk-participant-media-video': {
      objectFit: 'contain',
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
    },
    defaultVariants: {
      context: 'room',
    },
  })
)
