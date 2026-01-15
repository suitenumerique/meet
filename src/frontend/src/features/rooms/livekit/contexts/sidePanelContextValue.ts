import { createContext } from 'react'

export type SidePanelTriggerKey =
  | 'participants'
  | 'tools'
  | 'info'
  | 'admin'
  | 'options'
  | 'effects'

export type SidePanelContextValue = {
  panelRef: React.RefObject<HTMLElement>
  setTrigger: (key: SidePanelTriggerKey, el: HTMLElement | null) => void
  getTrigger: (key: SidePanelTriggerKey) => HTMLElement | null
}

export const SidePanelContext = createContext<SidePanelContextValue | null>(
  null
)
