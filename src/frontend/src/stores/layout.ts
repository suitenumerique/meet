import { proxy, ref } from 'valtio'
import type {
  PanelId,
  SubPanelId,
} from '@/features/rooms/livekit/hooks/useSidePanel'
import { TrackReferenceOrPlaceholder } from '@livekit/components-core'

type PinnedTrackRef = ReturnType<typeof ref<TrackReferenceOrPlaceholder>>

/**
 * Where the local camera sits in the stage.
 * - auto: corner thumbnail in 1-to-1, original grid otherwise
 * - corner: keep the local tile bottom-right even with more participants
 * - classic: original grid, including in 1-to-1
 */
export type SelfTileLayout = 'auto' | 'corner' | 'classic'

type State = {
  showHeader: boolean
  showFooter: boolean
  showSubtitles: boolean
  activePanelId: PanelId | null
  activeSubPanelId: SubPanelId | null
  showReactionsToolbar: boolean
  pinnedTrackRef?: PinnedTrackRef
  selfTileLayout: SelfTileLayout
  selfTileMinimized: boolean
}

export const layoutStore = proxy<State>({
  showHeader: false,
  showFooter: false,
  showSubtitles: false,
  activePanelId: null,
  activeSubPanelId: null,
  showReactionsToolbar: false,
  pinnedTrackRef: undefined,
  selfTileLayout: 'auto',
  selfTileMinimized: false,
})

export const setPinnedTrack = (trackRef: TrackReferenceOrPlaceholder): void => {
  layoutStore.pinnedTrackRef = ref(trackRef)
}

export const clearPinnedTrack = (): void => {
  layoutStore.pinnedTrackRef = undefined
}

/** Also opts into the corner layout, so the size choice survives past 2 participants. */
export const toggleSelfTileMinimized = (): void => {
  const isMinimized =
    layoutStore.selfTileLayout === 'corner' && layoutStore.selfTileMinimized
  layoutStore.selfTileLayout = 'corner'
  layoutStore.selfTileMinimized = !isMinimized
}

/** Show the local tile as a bottom-right thumbnail and keep it past 2 participants. */
export const showSelfTile = (): void => {
  layoutStore.selfTileLayout = 'corner'
  layoutStore.selfTileMinimized = false
}

/** Leave the corner thumbnail and return to the original grid. */
export const hideSelfTile = (): void => {
  layoutStore.selfTileLayout = 'classic'
  layoutStore.selfTileMinimized = false
}

export const closeSidePanel = (): void => {
  layoutStore.activePanelId = null
  layoutStore.activeSubPanelId = null
}
