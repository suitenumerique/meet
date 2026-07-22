import * as React from 'react'
import type { TrackReferenceOrPlaceholder } from '@livekit/components-core'
import {
  TrackLoop,
  usePagination,
  UseParticipantsOptions,
  useSwipe,
} from '@livekit/components-react'
import { mergeProps } from '@/utils/mergeProps'
import { PaginationIndicator } from './PaginationIndicator'
import { useGridLayout } from '../hooks/useGridLayout'
import { PaginationControl } from './PaginationControl'
import { useEffect, useRef, useState } from 'react'

interface GridLayoutObserverProps {
  gridEl: React.RefObject<HTMLDivElement>
  trackCount: number
  onMaxTilesChange: (maxTiles: number) => void
}

/**
 * Headless component that runs the layout calculation in isolation and
 * reports the resulting tile capacity upward.
 *
 * `useGridLayout` re-renders its host on every layout recalculation
 * (e.g. container resizes). Rendering it in a null child means only this
 * component churns; the parent `GridLayout` re-renders solely when
 * `maxTiles` actually changes, since `setState` bails out on equal values.
 */
const GridLayoutObserver = ({
  gridEl,
  trackCount,
  onMaxTilesChange,
}: GridLayoutObserverProps) => {
  const { layout } = useGridLayout(gridEl, trackCount)
  useEffect(() => {
    onMaxTilesChange(layout.maxTiles)
  }, [onMaxTilesChange, layout.maxTiles])

  return null
}

/** @public */
export interface GridLayoutProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    Pick<UseParticipantsOptions, 'updateOnlyOn'> {
  children: React.ReactNode
  tracks: TrackReferenceOrPlaceholder[]
}

/**
 * The `GridLayout` component displays the nested participants in a grid where every participants has the same size.
 * It also supports pagination if there are more participants than the grid can display.
 * @remarks
 * To ensure visual stability when tiles are reordered due to track updates,
 * the component uses the `useVisualStableUpdate` hook.
 * @example
 * ```tsx
 * <LiveKitRoom>
 *   <GridLayout tracks={tracks}>
 *     <ParticipantTile />
 *   </GridLayout>
 * <LiveKitRoom>
 * ```
 * @public
 */
export function GridLayout({ tracks, ...props }: GridLayoutProps) {
  const gridEl = useRef<HTMLDivElement>(null)
  const [maxTiles, setMaxTiles] = useState(1)

  const elementProps = React.useMemo(
    () => mergeProps(props, { className: 'lk-grid-layout' }),
    [props]
  )
  const pagination = usePagination(maxTiles, tracks)

  useSwipe(gridEl, {
    onLeftSwipe: pagination.nextPage,
    onRightSwipe: pagination.prevPage,
  })

  return (
    <div
      ref={gridEl}
      data-lk-pagination={pagination.totalPageCount > 1}
      {...elementProps}
    >
      <GridLayoutObserver
        gridEl={gridEl}
        trackCount={tracks.length}
        onMaxTilesChange={setMaxTiles}
      />
      <TrackLoop tracks={pagination.tracks}>{props.children}</TrackLoop>
      {tracks.length > maxTiles && (
        <>
          <PaginationIndicator
            totalPageCount={pagination.totalPageCount}
            currentPage={pagination.currentPage}
          />
          <PaginationControl pagesContainer={gridEl} {...pagination} />
        </>
      )}
    </div>
  )
}
