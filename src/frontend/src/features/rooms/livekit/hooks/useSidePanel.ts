import { useSnapshot } from 'valtio'
import { layoutStore } from '@/stores/layout'

export enum PanelId {
  PARTICIPANTS = 'participants',
  EFFECTS = 'effects',
  CHAT = 'chat',
  TOOLS = 'tools',
  ADMIN = 'admin',
  INFO = 'info',
}

export enum SubPanelId {
  TRANSCRIPT = 'transcript',
  SCREEN_RECORDING = 'screenRecording',
}

export const useSidePanel = () => {
  const layoutSnap = useSnapshot(layoutStore)
  const activePanelId = layoutSnap.activePanelId
  const activeSubPanelId = layoutSnap.activeSubPanelId

  const isParticipantsOpen = activePanelId == PanelId.PARTICIPANTS
  const isEffectsOpen = activePanelId == PanelId.EFFECTS
  const isChatOpen = activePanelId == PanelId.CHAT
  const isToolsOpen = activePanelId == PanelId.TOOLS
  const isAdminOpen = activePanelId == PanelId.ADMIN
  const isInfoOpen = activePanelId == PanelId.INFO
  const isTranscriptOpen = activeSubPanelId == SubPanelId.TRANSCRIPT
  const isScreenRecordingOpen = activeSubPanelId == SubPanelId.SCREEN_RECORDING
  const isSidePanelOpen = !!activePanelId
  const isSubPanelOpen = !!activeSubPanelId

  const toggleAdmin = () => {
    layoutStore.activePanelId = isAdminOpen ? null : PanelId.ADMIN
    if (layoutSnap.activeSubPanelId) layoutStore.activeSubPanelId = null
  }

  const toggleParticipants = () => {
    layoutStore.activePanelId = isParticipantsOpen ? null : PanelId.PARTICIPANTS
    if (layoutSnap.activeSubPanelId) layoutStore.activeSubPanelId = null
  }

  const toggleChat = () => {
    layoutStore.activePanelId = isChatOpen ? null : PanelId.CHAT
    if (layoutSnap.activeSubPanelId) layoutStore.activeSubPanelId = null
  }

  const toggleEffects = () => {
    layoutStore.activePanelId = isEffectsOpen ? null : PanelId.EFFECTS
    if (layoutSnap.activeSubPanelId) layoutStore.activeSubPanelId = null
  }

  const toggleTools = () => {
    layoutStore.activePanelId = isToolsOpen ? null : PanelId.TOOLS
    if (layoutSnap.activeSubPanelId) layoutStore.activeSubPanelId = null
  }

  const toggleInfo = () => {
    layoutStore.activePanelId = isInfoOpen ? null : PanelId.INFO
    if (layoutSnap.activeSubPanelId) layoutStore.activeSubPanelId = null
  }

  const openTranscript = () => {
    layoutStore.activeSubPanelId = SubPanelId.TRANSCRIPT
    layoutStore.activePanelId = PanelId.TOOLS
  }

  const openScreenRecording = () => {
    layoutStore.activeSubPanelId = SubPanelId.SCREEN_RECORDING
    layoutStore.activePanelId = PanelId.TOOLS
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
