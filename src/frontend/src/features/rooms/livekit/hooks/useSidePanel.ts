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

  // Reads the live store, not the render snapshot: shortcut handlers outlive
  // toggles that unmount (e.g. inside a closed overflow menu).
  const togglePanel = (panelId: PanelId) => {
    layoutStore.activePanelId =
      layoutStore.activePanelId === panelId ? null : panelId
    if (layoutStore.activeSubPanelId) layoutStore.activeSubPanelId = null
  }

  const toggleAdmin = () => togglePanel(PanelId.ADMIN)
  const toggleParticipants = () => togglePanel(PanelId.PARTICIPANTS)
  const toggleChat = () => togglePanel(PanelId.CHAT)
  const toggleEffects = () => togglePanel(PanelId.EFFECTS)
  const toggleTools = () => togglePanel(PanelId.TOOLS)
  const toggleInfo = () => togglePanel(PanelId.INFO)

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
