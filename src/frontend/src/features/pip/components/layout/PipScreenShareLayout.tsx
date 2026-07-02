import { memo } from 'react'
import type { TrackReferenceOrPlaceholder } from '@livekit/components-core'
import { styled } from '@/styled-system/jsx'
import { ParticipantTile } from '@/features/rooms/livekit/components/ParticipantTile'
import { getTrackKey } from '../../utils/pipTrackSelection'

type PipScreenShareLayoutProps = {
  screenShareTrack: TrackReferenceOrPlaceholder
  cameraTracks: TrackReferenceOrPlaceholder[]
}

/**
 * Layout when a screen share is active.
 * Camera tiles are shown as a compact row at the top; the screen share occupies
 * the remaining space below, much larger than the camera tiles.
 */
export const PipScreenShareLayout = memo(
  ({ screenShareTrack, cameraTracks }: PipScreenShareLayoutProps) => {
    return (
      <LayoutContainer>
        {cameraTracks.length > 0 && (
          <CameraTilesRow>
            {cameraTracks.map((track) => (
              <CameraTile key={getTrackKey(track)}>
                <ParticipantTile trackRef={track} disableTileControls />
              </CameraTile>
            ))}
          </CameraTilesRow>
        )}
        <ScreenShareSlot>
          <ParticipantTile trackRef={screenShareTrack} disableTileControls />
        </ScreenShareSlot>
      </LayoutContainer>
    )
  }
)
PipScreenShareLayout.displayName = 'PipScreenShareLayout'

const LayoutContainer = styled('div', {
  base: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    boxSizing: 'border-box',
    overflow: 'hidden',
  },
})

const CameraTilesRow = styled('div', {
  base: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: '0.5rem',
    flexShrink: 0,
    height: '22%',
    minHeight: '60px',
    maxHeight: '120px',
  },
})

const CameraTile = styled('div', {
  base: {
    position: 'relative',
    flex: '0 1 auto',
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
  },
})

const ScreenShareSlot = styled('div', {
  base: {
    position: 'relative',
    flex: 1,
    minHeight: 0,
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
