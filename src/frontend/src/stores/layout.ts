import { proxy } from 'valtio'
import { PanelId } from '@/features/rooms/livekit/hooks/useSidePanel'

type State = {
  showHeader: boolean
  showFooter: boolean
  showSubtitles: boolean
  activePanelId: PanelId | null
  activeSubPanelId: string | null
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
