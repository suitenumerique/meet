import { proxy } from 'valtio'
import { PanelId, SubPanelId } from '@/features/rooms/livekit/types/panel'

type State = {
  showHeader: boolean
  showFooter: boolean
  showSubtitles: boolean
  activePanelId: PanelId | null
  activeSubPanelId: SubPanelId | null
  showReactionsToolbar: boolean
}

export const layoutStore = proxy<State>({
  showHeader: false,
  showFooter: false,
  showSubtitles: false,
  activePanelId: null,
  activeSubPanelId: null,
  showReactionsToolbar: false,
})
