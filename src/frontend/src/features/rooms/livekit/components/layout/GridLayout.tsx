import * as React from 'react'
import type { TrackReferenceOrPlaceholder } from '@livekit/components-core'
import {
  TrackLoop,
  usePagination,
  UseParticipantsOptions,
  useSwipe,
} from '@livekit/components-react'
import { mergeProps } from '@/utils/mergeProps'
import { PaginationIndicator } from '../controls/PaginationIndicator'
import { useGridLayout } from '../../hooks/useGridLayout'
import { PaginationControl } from '../controls/PaginationControl'
import { setGridLayout, resetLayout } from '@/stores/participantLayout'
import { isTrackReference } from '@livekit/components-core'

/** @public */
export interface GridLayoutProps
  extends React.HTMLAttributes<HTMLDivElement>,
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
const getTrackId = (trackRef: TrackReferenceOrPlaceholder): string | null => {
  if (!isTrackReference(trackRef)) return null
  return `${trackRef.participant.sid}-${trackRef.source}`
}

export function GridLayout({ tracks, ...props }: GridLayoutProps) {
  const gridEl = React.createRef<HTMLDivElement>()

  const elementProps = React.useMemo(
    () => mergeProps(props, { className: 'lk-grid-layout' }),
    [props]
  )
  const { layout } = useGridLayout(gridEl, tracks.length)
  const pagination = usePagination(layout.maxTiles, tracks)

  useSwipe(gridEl, {
    onLeftSwipe: pagination.nextPage,
    onRightSwipe: pagination.prevPage,
  })

  // Update store when tracks change - set first tile ID for grid layout
  React.useEffect(() => {
    const firstTrack = pagination.tracks[0]
    const firstTrackId = firstTrack ? getTrackId(firstTrack) : null
    setGridLayout(firstTrackId)
    
    return () => {
      resetLayout()
    }
  }, [pagination.tracks])

  return (
    <div
      ref={gridEl}
      data-lk-pagination={pagination.totalPageCount > 1}
      {...elementProps}
    >
      <TrackLoop tracks={pagination.tracks}>{props.children}</TrackLoop>
      {tracks.length > layout.maxTiles && (
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
