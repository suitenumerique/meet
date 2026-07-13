import { proxy, ref } from 'valtio'
import type {
  PanelId,
  SubPanelId,
} from '@/features/rooms/livekit/hooks/useSidePanel'
import { TrackReferenceOrPlaceholder } from '@livekit/components-core'

type PinnedTrackRef = ReturnType<typeof ref<TrackReferenceOrPlaceholder>>

type State = {
  showHeader: boolean
  showFooter: boolean
  showSubtitles: boolean
  activePanelId: PanelId | null
  activeSubPanelId: SubPanelId | null
  showReactionsToolbar: boolean
  pinnedTrackRef?: PinnedTrackRef
}

export const layoutStore = proxy<State>({
  showHeader: false,
  showFooter: false,
  showSubtitles: false,
  activePanelId: null,
  activeSubPanelId: null,
  showReactionsToolbar: false,
  pinnedTrackRef: undefined,
})

export const setPinnedTrack = (trackRef: TrackReferenceOrPlaceholder): void => {
  layoutStore.pinnedTrackRef = ref(trackRef)
}

export const clearPinnedTrack = (): void => {
  layoutStore.pinnedTrackRef = undefined
}
