import { useSnapshot } from 'valtio'
import { layoutStore } from '@/stores/layout'
import { PanelId, SubPanelId } from '../types/panel'

export { PanelId, SubPanelId }

export type SidePanelStore = {
  activePanelId: PanelId | null
  activeSubPanelId: SubPanelId | null
}

export const useSidePanel = (store: SidePanelStore = layoutStore) => {
  const layoutSnap = useSnapshot(store)
  const activePanelId = layoutSnap.activePanelId
  const activeSubPanelId = layoutSnap.activeSubPanelId

  const isParticipantsOpen = activePanelId === PanelId.PARTICIPANTS
  const isEffectsOpen = activePanelId === PanelId.EFFECTS
  const isChatOpen = activePanelId === PanelId.CHAT
  const isToolsOpen = activePanelId === PanelId.TOOLS
  const isAdminOpen = activePanelId === PanelId.ADMIN
  const isInfoOpen = activePanelId === PanelId.INFO
  const isTranscriptOpen = activeSubPanelId === SubPanelId.TRANSCRIPT
  const isScreenRecordingOpen = activeSubPanelId === SubPanelId.SCREEN_RECORDING
  const isSidePanelOpen = !!activePanelId
  const isSubPanelOpen = !!activeSubPanelId

  const toggleAdmin = () => {
    store.activePanelId = isAdminOpen ? null : PanelId.ADMIN
    if (layoutSnap.activeSubPanelId) store.activeSubPanelId = null
  }

  const toggleParticipants = () => {
    store.activePanelId = isParticipantsOpen ? null : PanelId.PARTICIPANTS
    if (layoutSnap.activeSubPanelId) store.activeSubPanelId = null
  }

  const toggleChat = () => {
    store.activePanelId = isChatOpen ? null : PanelId.CHAT
    if (layoutSnap.activeSubPanelId) store.activeSubPanelId = null
  }

  const toggleEffects = () => {
    store.activePanelId = isEffectsOpen ? null : PanelId.EFFECTS
    if (layoutSnap.activeSubPanelId) store.activeSubPanelId = null
  }

  const toggleTools = () => {
    store.activePanelId = isToolsOpen ? null : PanelId.TOOLS
    if (layoutSnap.activeSubPanelId) store.activeSubPanelId = null
  }

  const toggleInfo = () => {
    store.activePanelId = isInfoOpen ? null : PanelId.INFO
    if (layoutSnap.activeSubPanelId) store.activeSubPanelId = null
  }

  const openTranscript = () => {
    store.activeSubPanelId = SubPanelId.TRANSCRIPT
    store.activePanelId = PanelId.TOOLS
  }

  const openScreenRecording = () => {
    store.activeSubPanelId = SubPanelId.SCREEN_RECORDING
    store.activePanelId = PanelId.TOOLS
  }

  const closePanel = () => {
    store.activePanelId = null
    store.activeSubPanelId = null
  }

  const goBack = () => {
    store.activeSubPanelId = null
  }

  return {
    activePanelId,
    activeSubPanelId,
    toggleParticipants,
    toggleChat,
    toggleEffects,
    toggleTools,
    toggleAdmin,
    toggleInfo,
    openTranscript,
    openScreenRecording,
    closePanel,
    goBack,
    isSubPanelOpen,
    isChatOpen,
    isParticipantsOpen,
    isEffectsOpen,
    isSidePanelOpen,
    isToolsOpen,
    isAdminOpen,
    isInfoOpen,
    isTranscriptOpen,
    isScreenRecordingOpen,
  }
}
