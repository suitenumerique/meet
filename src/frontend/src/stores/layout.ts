import { proxy } from 'valtio'
import {
  PanelId,
  SubPanelId,
} from '@/features/rooms/livekit/hooks/useSidePanel'

type State = {
  showHeader: boolean
  showFooter: boolean
  showSubtitles: boolean
  activePanelId: PanelId | null
  activeSubPanelId: SubPanelId | null
  genericRef: HTMLElement | null
}

export const layoutStore = proxy<State>({
  showHeader: false,
  showFooter: false,
  showSubtitles: false,
  activePanelId: null,
  activeSubPanelId: null,
  genericRef: null,
})
