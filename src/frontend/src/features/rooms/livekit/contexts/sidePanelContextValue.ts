import { createContext } from 'react'

export type SidePanelContextValue = {
  panelRef: React.RefObject<HTMLElement>
}

export const SidePanelContext = createContext<SidePanelContextValue | null>(
  null
)
