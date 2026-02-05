import type { TrackReferenceOrPlaceholder } from '@livekit/components-core'
import { getScrollBarWidth } from '@livekit/components-core'
import * as React from 'react'
import { TrackLoop, useVisualStableUpdate } from '@livekit/components-react'
import { useSize } from '@/features/rooms/livekit/hooks/useResizeObserver'
import { setCarouselLayout, resetLayout } from '@/stores/participantLayout'

const MIN_HEIGHT = 130
const MIN_WIDTH = 140
const MIN_VISIBLE_TILES = 1
const ASPECT_RATIO = 16 / 10
const ASPECT_RATIO_INVERT = (1 - ASPECT_RATIO) * -1

/** @public */
export interface CarouselLayoutProps
  extends React.HTMLAttributes<HTMLMediaElement> {
  tracks: TrackReferenceOrPlaceholder[]
  children: React.ReactNode
  /** Place the tiles vertically or horizontally next to each other.
   * If undefined orientation is guessed by the dimensions of the container. */
  orientation?: 'vertical' | 'horizontal'
}

/**
 * The `CarouselLayout` component displays a list of tracks in a scroll container.
 * It will display as many tiles as possible and overflow the rest.
 * @remarks
 * To ensure visual stability when tiles are reordered due to track updates,
 * the component uses the `useVisualStableUpdate` hook.
 * @example
 * ```tsx
 * const tracks = useTracks([Track.Source.Camera]);
 * <CarouselLayout tracks={tracks}>
 *   <ParticipantTile />
 * </CarouselLayout>
 * ```
 * @public
 */
export function CarouselLayout({
  tracks,
  orientation,
  ...props
}: CarouselLayoutProps) {
  const asideEl = React.useRef<HTMLDivElement>(null)
  const [prevTiles, setPrevTiles] = React.useState(0)
  const { width, height } = useSize(asideEl)
  const carouselOrientation = orientation
    ? orientation
    : height >= width
      ? 'vertical'
      : 'horizontal'

  const tileSpan =
    carouselOrientation === 'vertical'
      ? Math.max(width * ASPECT_RATIO_INVERT, MIN_HEIGHT)
      : Math.max(height * ASPECT_RATIO, MIN_WIDTH)
  const scrollBarWidth = getScrollBarWidth()

  const tilesThatFit =
    carouselOrientation === 'vertical'
      ? Math.max((height - scrollBarWidth) / tileSpan, MIN_VISIBLE_TILES)
      : Math.max((width - scrollBarWidth) / tileSpan, MIN_VISIBLE_TILES)

  let maxVisibleTiles = Math.round(tilesThatFit)
  if (Math.abs(tilesThatFit - prevTiles) < 0.5) {
    maxVisibleTiles = Math.round(prevTiles)
  } else if (prevTiles !== tilesThatFit) {
    setPrevTiles(tilesThatFit)
  }

  const sortedTiles = useVisualStableUpdate(tracks, maxVisibleTiles)

  React.useLayoutEffect(() => {
    if (asideEl.current) {
      asideEl.current.dataset.lkOrientation = carouselOrientation
      asideEl.current.style.setProperty(
        '--lk-max-visible-tiles',
        maxVisibleTiles.toString()
      )
    }
  }, [maxVisibleTiles, carouselOrientation])

  // Update store when carousel layout is active
  React.useEffect(() => {
    setCarouselLayout()
    
    return () => {
      resetLayout()
    }
  }, [])

  return (
    <aside
      key={carouselOrientation}
      className="lk-carousel"
      ref={asideEl}
      {...props}
    >
      <TrackLoop tracks={sortedTiles}>{props.children}</TrackLoop>
    </aside>
  )
}
