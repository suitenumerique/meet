import type { TrackReferenceOrPlaceholder } from '@livekit/components-core'
import { getScrollBarWidth } from '@livekit/components-core'
import * as React from 'react'
import { TrackLoop, useVisualStableUpdate } from '@livekit/components-react'
import { useSize } from '@/features/rooms/livekit/hooks/useResizeObserver'
import { useCallback, useEffect, useLayoutEffect } from 'react'

const MIN_HEIGHT = 130
const MIN_WIDTH = 140
const MIN_VISIBLE_TILES = 1
const ASPECT_RATIO = 16 / 10
const ASPECT_RATIO_INVERT = (1 - ASPECT_RATIO) * -1

type CarouselOrientation = 'vertical' | 'horizontal'

interface CarouselLayoutState {
  orientation: CarouselOrientation
  maxVisibleTiles: number
}

interface CarouselLayoutObserverProps {
  asideEl: React.RefObject<HTMLDivElement>
  orientation?: CarouselOrientation
  onLayoutChange: (layout: CarouselLayoutState) => void
}

const CarouselLayoutObserver = ({
  orientation,
  asideEl,
  onLayoutChange,
}: CarouselLayoutObserverProps) => {
  const { width, height } = useSize(asideEl)

  // Hysteresis memory: avoids flapping between N and N+1 tiles when the
  // container size hovers around a breakpoint. A ref (not state) because
  // updating it must not trigger a re-render.
  const prevTilesRef = React.useRef(0)

  const carouselOrientation: CarouselOrientation =
    orientation ?? (height >= width ? 'vertical' : 'horizontal')

  const tileSpan =
    carouselOrientation === 'vertical'
      ? Math.max(width * ASPECT_RATIO_INVERT, MIN_HEIGHT)
      : Math.max(height * ASPECT_RATIO, MIN_WIDTH)

  const scrollBarWidth = getScrollBarWidth()

  const availableSpan =
    (carouselOrientation === 'vertical' ? height : width) - scrollBarWidth

  const tilesThatFit = Math.max(availableSpan / tileSpan, MIN_VISIBLE_TILES)

  let maxVisibleTiles: number
  if (Math.abs(tilesThatFit - prevTilesRef.current) < 0.5) {
    // Within the dead zone: keep the previous count.
    maxVisibleTiles = Math.round(prevTilesRef.current)
  } else {
    maxVisibleTiles = Math.round(tilesThatFit)
    prevTilesRef.current = tilesThatFit
  }

  // Apply cosmetic layout output straight to the DOM.
  useLayoutEffect(() => {
    const el = asideEl.current
    if (!el) return
    el.dataset.lkOrientation = carouselOrientation
    el.style.setProperty('--lk-max-visible-tiles', maxVisibleTiles.toString())
  }, [asideEl, carouselOrientation, maxVisibleTiles])

  // Report upward only what the parent actually needs for
  // `useVisualStableUpdate` (and only when it changes — see parent handler).
  useEffect(() => {
    onLayoutChange({ orientation: carouselOrientation, maxVisibleTiles })
  }, [carouselOrientation, maxVisibleTiles, onLayoutChange])

  return null
}

/** @public */
export interface CarouselLayoutProps extends React.HTMLAttributes<HTMLMediaElement> {
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

  const [layout, setLayout] = React.useState<CarouselLayoutState>({
    orientation: orientation ?? 'vertical',
    maxVisibleTiles: MIN_VISIBLE_TILES,
  })

  // Stable callback + identity check: the parent only re-renders when the
  // derived layout genuinely changed, not on every resize tick.
  const handleLayoutChange = useCallback((next: CarouselLayoutState) => {
    setLayout((prev) =>
      prev.orientation === next.orientation &&
      prev.maxVisibleTiles === next.maxVisibleTiles
        ? prev
        : next
    )
  }, [])

  const sortedTiles = useVisualStableUpdate(tracks, layout.maxVisibleTiles)

  return (
    <>
      <CarouselLayoutObserver
        asideEl={asideEl}
        orientation={orientation}
        onLayoutChange={handleLayoutChange}
      />
      {/* `key` intentionally remounts the container when orientation flips, */}
      {/* which resets scroll position and re-runs the observer measurement. */}
      <aside
        key={layout.orientation}
        className="lk-carousel"
        ref={asideEl}
        {...props}
      >
        <TrackLoop tracks={sortedTiles}>{props.children}</TrackLoop>
      </aside>
    </>
  )
}
