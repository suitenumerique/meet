import { GRID_LAYOUTS, selectGridLayout } from '@livekit/components-core'
import type {
  GridLayoutDefinition,
  GridLayoutInfo,
} from '@livekit/components-core'
import * as React from 'react'
import { useSize } from '@/features/rooms/livekit/hooks/useResizeObserver'

/**
 * The `useGridLayout` hook tries to select the best layout to fit all tiles.
 * If the available screen space is not enough, it will reduce the number of maximum visible
 * tiles and select a layout that still works visually within the given limitations.
 * As the order of tiles changes over time, the hook tries to keep visual updates to a minimum
 * while trying to display important tiles such as speaking participants or screen shares.
 *
 * @example
 * ```tsx
 * const { layout } = useGridLayout(gridElement, trackCount);
 * ```
 * @public
 */
export function useGridLayout(
  /** HTML element that contains the grid. */
  gridElement: React.RefObject<HTMLDivElement>,
  /** Count of tracks that should get layed out */
  trackCount: number,
  options: {
    gridLayouts?: GridLayoutDefinition[]
  } = {}
): { layout: GridLayoutInfo; containerWidth: number; containerHeight: number } {
  const gridLayouts = options.gridLayouts ?? GRID_LAYOUTS
  const { width, height } = useSize(gridElement)
  const layout = selectGridLayout(gridLayouts, trackCount, width, height)

  React.useEffect(() => {
    if (gridElement.current && layout) {
      gridElement.current.style.setProperty(
        '--lk-col-count',
        layout?.columns.toString()
      )
      gridElement.current.style.setProperty(
        '--lk-row-count',
        layout?.rows.toString()
      )
    }
  }, [gridElement, layout])

  return {
    layout,
    containerWidth: width,
    containerHeight: height,
  }
}
