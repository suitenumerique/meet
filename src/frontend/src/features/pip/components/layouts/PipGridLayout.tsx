import { memo, useMemo, useRef } from 'react'
import type { TrackReferenceOrPlaceholder } from '@livekit/components-core'
import { styled } from '@/styled-system/jsx'
import { ParticipantTile } from '@/features/rooms/livekit/components/ParticipantTile'
import { usePipElementSize } from '../../hooks/usePipElementSize'
import { usePipFlipAnimations } from '../../hooks/usePipFlipAnimations'
import { computePipGridLayout } from '../../utils/pipGrid'
import { getTrackKey } from '../../utils/pipTrackSelection'

type PipGridLayoutProps = {
  tracks: TrackReferenceOrPlaceholder[]
}

/**
 * Adaptive grid used when 3+ tracks are visible in the PiP window.
 *
 * All grid math (shape choice + partial-row stretching) is delegated to
 * `computePipGridLayout`. This component only measures the container,
 * applies the returned placements, and plays a FLIP animation when the
 * tile set or grid shape changes (participant joins/leaves or shape shift).
 *
 * Tiles keep a stable key so resizing never remounts <video> elements.
 */
export const PipGridLayout = memo(function PipGridLayout({
  tracks,
}: PipGridLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { width, height } = usePipElementSize(containerRef)

  const tileKeys = useMemo(() => tracks.map(getTrackKey), [tracks])

  const { rows, subColumns, placements } = useMemo(
    () => computePipGridLayout(tracks.length, width, height),
    [tracks.length, width, height]
  )

  const gridStyle = useMemo(
    () => ({
      gridTemplateColumns: `repeat(${subColumns}, minmax(0, 1fr))`,
      gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
    }),
    [subColumns, rows]
  )

  usePipFlipAnimations(containerRef, tileKeys)

  return (
    <GridContainer ref={containerRef} style={gridStyle}>
      {tracks.map((track, index) => (
        <GridCell key={tileKeys[index]} style={placements[index]}>
          <ParticipantTile trackRef={track} disableMetadata />
        </GridCell>
      ))}
    </GridContainer>
  )
})

const GridContainer = styled('div', {
  base: {
    width: '100%',
    height: '100%',
    display: 'grid',
    gap: '0.25rem',
  },
})

const GridCell = styled('div', {
  base: {
    position: 'relative',
    minWidth: 0,
    minHeight: 0,
    borderRadius: 'md',
    overflow: 'hidden',
    backgroundColor: 'primaryDark.100',
    // Paint on own layer so FLIP transforms don't trigger layout thrash.
    willChange: 'transform',
    '& .lk-participant-tile': {
      width: '100%',
      height: '100%',
    },
  },
})
