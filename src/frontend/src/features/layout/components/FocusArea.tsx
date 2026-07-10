import type { TrackReferenceOrPlaceholder } from '@livekit/components-core'
import { styled } from '@/styled-system/jsx'
import { FocusLayout } from '@/features/rooms/livekit/components/FocusLayout'
import { SecondaryScreenShareStrip } from './SecondaryScreenShareStrip'

export interface FocusAreaProps {
  focusTrack: TrackReferenceOrPlaceholder
  secondaryScreenShareTracks: TrackReferenceOrPlaceholder[]
}

/**
 * Main focus track with an optional strip of secondary screen shares below.
 */
export function FocusArea({
  focusTrack,
  secondaryScreenShareTracks,
}: FocusAreaProps) {
  return (
    <FocusColumn>
      <MainFocusSlot>
        <FocusLayout trackRef={focusTrack} />
      </MainFocusSlot>
      <SecondaryScreenShareStrip tracks={secondaryScreenShareTracks} />
    </FocusColumn>
  )
}

const FocusColumn = styled('div', {
  base: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
  },
})

const MainFocusSlot = styled('div', {
  base: {
    position: 'relative',
    flex: 1,
    minHeight: 0,
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
