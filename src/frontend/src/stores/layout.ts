import { createRef } from 'react'
import { proxy, ref } from 'valtio'
import {
  PanelId,
  SubPanelId,
} from '@/features/rooms/livekit/hooks/useSidePanel'
import type { SidePanelTriggerKey } from '@/features/rooms/livekit/types/sidePanelTypes'
import type { MutableRefObject, RefObject } from 'react'

type State = {
  showHeader: boolean
  showFooter: boolean
  showSubtitles: boolean
  activePanelId: PanelId | null
  activeSubPanelId: SubPanelId | null
  sidePanelRef: RefObject<HTMLElement>
  sidePanelTriggers: Record<SidePanelTriggerKey, HTMLElement | null>
  lastSidePanelTriggerRef: MutableRefObject<HTMLElement | null>
}

const sidePanelRef = ref(createRef<HTMLElement>())
const lastSidePanelTriggerRef = ref({
  current: null,
} as MutableRefObject<HTMLElement | null>)
const sidePanelTriggers = ref<Record<SidePanelTriggerKey, HTMLElement | null>>({
  participants: null,
  tools: null,
  info: null,
  admin: null,
  options: null,
  effects: null,
  cameraMenu: null,
})

export const layoutStore = proxy<State>({
  showHeader: false,
  showFooter: false,
  showSubtitles: false,
  activePanelId: null,
  activeSubPanelId: null,
  sidePanelRef,
  sidePanelTriggers,
  lastSidePanelTriggerRef,
})
