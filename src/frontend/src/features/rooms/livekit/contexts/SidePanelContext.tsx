import { useRef, ReactNode } from 'react'
import { SidePanelContext, SidePanelTriggerKey } from './sidePanelContextValue'

export const SidePanelProvider = ({ children }: { children: ReactNode }) => {
  const panelRef = useRef<HTMLElement>(null)
  const triggersRef = useRef<Record<SidePanelTriggerKey, HTMLElement | null>>({
    participants: null,
    tools: null,
    info: null,
    admin: null,
    options: null,
    effects: null,
    cameraMenu: null,
  })

  const setTrigger = (key: SidePanelTriggerKey, el: HTMLElement | null) => {
    triggersRef.current[key] = el
  }

  const getTrigger = (key: SidePanelTriggerKey) => {
    return triggersRef.current[key] ?? null
  }

  return (
    <SidePanelContext.Provider value={{ panelRef, setTrigger, getTrigger }}>
      {children}
    </SidePanelContext.Provider>
  )
}
