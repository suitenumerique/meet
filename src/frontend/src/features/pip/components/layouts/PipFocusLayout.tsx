import { memo } from 'react'
import type { TrackReferenceOrPlaceholder } from '@livekit/components-core'
import { styled } from '@/styled-system/jsx'
import { ParticipantTile } from '@/features/rooms/livekit/components/ParticipantTile'
import { getTrackKey } from '../../utils/pipTrackSelection'

type PipFocusLayoutProps = {
  mainTrack: TrackReferenceOrPlaceholder
  thumbnailTrack?: TrackReferenceOrPlaceholder
}

/**
 * Focus layout used when 1-2 tracks are visible in the PiP window.
 *
 * The main tile is letterboxed (object-fit: contain) so the camera is
 * never stretched to a non-video aspect and leaves dark padding
 * above/below when the window shape doesn't match the source.
 * The thumbnail keeps the usual cover fill.
 */
export const PipFocusLayout = memo(function PipFocusLayout({
  mainTrack,
  thumbnailTrack,
}: PipFocusLayoutProps) {
  return (
    <FocusContainer>
      <MainSlot>
        <ParticipantTile
          key={getTrackKey(mainTrack)}
          trackRef={mainTrack}
          disableMetadata
        />
      </MainSlot>
      {thumbnailTrack && (
        <Thumbnail>
          <ParticipantTile
            key={getTrackKey(thumbnailTrack)}
            trackRef={thumbnailTrack}
            disableMetadata
          />
        </Thumbnail>
      )}
    </FocusContainer>
  )
})

const FocusContainer = styled('div', {
  base: {
    position: 'relative',
    width: '100%',
    height: '100%',
    borderRadius: '4px',
    overflow: 'hidden',
    backgroundColor: 'primaryDark.100',
  },
})

const MainSlot = styled('div', {
  base: {
    width: '100%',
    height: '100%',
    '& .lk-participant-media-video': {
      objectFit: 'contain',
    },
  },
})

const Thumbnail = styled('div', {
  base: {
    position: 'absolute',
    right: '1rem',
    bottom: '1rem',
    width: '42%',
    maxWidth: '220px',
    minWidth: '140px',
    aspectRatio: '16 / 9',
    borderRadius: '4px',
    overflow: 'hidden',
    boxShadow: 'md',
    zIndex: 2,
  },
})
