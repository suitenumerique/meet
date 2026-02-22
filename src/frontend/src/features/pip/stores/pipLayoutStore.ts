import { proxy } from 'valtio'
import type { PanelId, SubPanelId } from '@/features/rooms/livekit/types/panel'

type PipLayoutState = {
  activePanelId: PanelId | null
  activeSubPanelId: SubPanelId | null
}

/**
 * Separate layout store for the PiP window.
 * Decouples PiP side panel state from the main view so opening Chat/Info/etc.
 * in PiP does not affect the main window and vice versa.
 */
export const pipLayoutStore = proxy<PipLayoutState>({
  activePanelId: null,
  activeSubPanelId: null,
})
