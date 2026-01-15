import { useRef, ReactNode } from 'react'
import { SidePanelContext } from './sidePanelContextValue'

export const SidePanelProvider = ({ children }: { children: ReactNode }) => {
  const panelRef = useRef<HTMLElement>(null)

  return (
    <SidePanelContext.Provider value={{ panelRef }}>
      {children}
    </SidePanelContext.Provider>
  )
}
