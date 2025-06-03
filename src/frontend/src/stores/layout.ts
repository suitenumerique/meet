import { proxy } from 'valtio'
import {
  PanelId,
  SubPanelId,
} from '@/features/rooms/livekit/hooks/useSidePanel'

type State = {
  showHeader: boolean
  showFooter: boolean
  showSubtitle: false,
  activePanelId: PanelId | null
  activeSubPanelId: SubPanelId | null
}

export const layoutStore = proxy<State>({
  showHeader: false,
  showFooter: false,
  showSubtitle: false,
  activePanelId: null,
  activeSubPanelId: null,
})
