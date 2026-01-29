import { useSnapshot } from 'valtio'
import { layoutStore } from '@/stores/layout'
import { useEffect, useRef } from 'react'
import type { SidePanelTriggerKey } from '../types/sidePanelTypes'

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
  const lastInteractionRef = useRef<'keyboard' | 'mouse' | null>(null)
  const prevPanelIdRef = useRef<PanelId | null>(activePanelId)

  const resolveTrigger = (panelId: PanelId, activeEl: HTMLElement | null) => {
    if (activeEl?.tagName === 'DIV') {
      if (panelId === PanelId.TOOLS || panelId === PanelId.EFFECTS) {
        return layoutStore.sidePanelTriggers.options ?? activeEl
      }
    }
    const triggerKeyByPanel: Partial<Record<PanelId, SidePanelTriggerKey>> = {
      [PanelId.PARTICIPANTS]: 'participants',
      [PanelId.TOOLS]: 'tools',
      [PanelId.INFO]: 'info',
      [PanelId.ADMIN]: 'admin',
      [PanelId.EFFECTS]: 'effects',
    }
    const triggerKey = triggerKeyByPanel[panelId]
    return triggerKey
      ? layoutStore.sidePanelTriggers[triggerKey] ?? activeEl
      : activeEl
  }

  const storeLastTrigger = (panelId: PanelId) => {
    const activeEl = document.activeElement as HTMLElement | null
    layoutStore.lastSidePanelTriggerRef.current = resolveTrigger(
      panelId,
      activeEl
    )
  }

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
    if (!isAdminOpen) storeLastTrigger(PanelId.ADMIN)
    layoutStore.activePanelId = isAdminOpen ? null : PanelId.ADMIN
    if (layoutSnap.activeSubPanelId) layoutStore.activeSubPanelId = null
  }

  const toggleParticipants = () => {
    if (!isParticipantsOpen) storeLastTrigger(PanelId.PARTICIPANTS)
    layoutStore.activePanelId = isParticipantsOpen ? null : PanelId.PARTICIPANTS
    if (layoutSnap.activeSubPanelId) layoutStore.activeSubPanelId = null
  }

  const toggleChat = () => {
    if (!isChatOpen) storeLastTrigger(PanelId.CHAT)
    layoutStore.activePanelId = isChatOpen ? null : PanelId.CHAT
    if (layoutSnap.activeSubPanelId) layoutStore.activeSubPanelId = null
  }

  const toggleEffects = () => {
    if (!isEffectsOpen) storeLastTrigger(PanelId.EFFECTS)
    layoutStore.activePanelId = isEffectsOpen ? null : PanelId.EFFECTS
    if (layoutSnap.activeSubPanelId) layoutStore.activeSubPanelId = null
  }

  const toggleTools = () => {
    if (!isToolsOpen) storeLastTrigger(PanelId.TOOLS)
    layoutStore.activePanelId = isToolsOpen ? null : PanelId.TOOLS
    if (layoutSnap.activeSubPanelId) layoutStore.activeSubPanelId = null
  }

  const toggleInfo = () => {
    if (!isInfoOpen) storeLastTrigger(PanelId.INFO)
    layoutStore.activePanelId = isInfoOpen ? null : PanelId.INFO
    if (layoutSnap.activeSubPanelId) layoutStore.activeSubPanelId = null
  }

  const openTranscript = () => {
    storeLastTrigger(PanelId.TOOLS)
    layoutStore.activeSubPanelId = SubPanelId.TRANSCRIPT
    layoutStore.activePanelId = PanelId.TOOLS
  }

  const openScreenRecording = () => {
    storeLastTrigger(PanelId.TOOLS)
    layoutStore.activeSubPanelId = SubPanelId.SCREEN_RECORDING
    layoutStore.activePanelId = PanelId.TOOLS
  }

  const closeSidePanel = () => {
    if (isSubPanelOpen) {
      layoutStore.activeSubPanelId = null
      layoutStore.activePanelId = null
      return
    }
    layoutStore.activePanelId = null
  }

  useEffect(() => {
    const handleKeyDown = () => {
      lastInteractionRef.current = 'keyboard'
    }
    const handleMouseDown = () => {
      lastInteractionRef.current = 'mouse'
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleMouseDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [])

  useEffect(() => {
    const wasOpen = prevPanelIdRef.current

    if (wasOpen && !activePanelId) {
      const trigger = layoutStore.lastSidePanelTriggerRef.current
      if (trigger && document.contains(trigger)) {
        trigger.focus({ preventScroll: true })
        if (lastInteractionRef.current === 'keyboard') {
          trigger.setAttribute('data-restore-focus-visible', '')
          const handleBlur = () => {
            if (document.contains(trigger)) {
              trigger.removeAttribute('data-restore-focus-visible')
            }
          }
          trigger.addEventListener('blur', handleBlur, { once: true })
        }
      }
    }

    prevPanelIdRef.current = activePanelId
  }, [activePanelId])

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
    closeSidePanel,
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
