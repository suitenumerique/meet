import { useContext } from 'react'
import { SidePanelContext } from '../contexts/sidePanelContextValue'

export const useSidePanelRef = () => {
  const context = useContext(SidePanelContext)
  if (!context) {
    throw new Error('useSidePanelRef must be used within SidePanelProvider')
  }
  return context.panelRef
}
