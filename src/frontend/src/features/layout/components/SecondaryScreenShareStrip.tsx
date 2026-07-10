import type { TrackReferenceOrPlaceholder } from '@livekit/components-core'
import { memo } from 'react'
import { styled } from '@/styled-system/jsx'
import { ParticipantTile } from '@/features/rooms/livekit/components/ParticipantTile'
import { getTrackKey } from '@/features/pip/utils/pipTrackSelection'

export interface SecondaryScreenShareStripProps {
  tracks: TrackReferenceOrPlaceholder[]
}

/**
 * Compact horizontal strip for non-focused screen shares.
 * Each tile keeps pin controls so users can switch focus to any share.
 */
export const SecondaryScreenShareStrip = memo(
  ({ tracks }: SecondaryScreenShareStripProps) => {
    if (tracks.length === 0) return null

    return (
      <StripContainer>
        {tracks.map((track) => (
          <ShareTile key={getTrackKey(track)}>
            <ParticipantTile trackRef={track} />
          </ShareTile>
        ))}
      </StripContainer>
    )
  }
)
SecondaryScreenShareStrip.displayName = 'SecondaryScreenShareStrip'

const StripContainer = styled('div', {
  base: {
    display: 'flex',
    flexDirection: 'row',
    gap: '0.5rem',
    flexShrink: 0,
    height: '120px',
    minHeight: '80px',
    maxHeight: '140px',
    padding: '0.5rem 0 0',
    overflowX: 'auto',
    overflowY: 'hidden',
    boxSizing: 'border-box',
  },
})

const ShareTile = styled('div', {
  base: {
    position: 'relative',
    flex: '0 0 auto',
    height: '100%',
    aspectRatio: '16 / 9',
    minWidth: 0,
    borderRadius: '8px',
    overflow: 'hidden',
    backgroundColor: 'primaryDark.100',
    '& .lk-participant-tile': {
      width: '100%',
      height: '100%',
    },
    '& .lk-participant-media-video': {
      objectFit: 'contain',
    },
  },
})
