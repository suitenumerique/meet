import { useContext } from 'react'
import { SidePanelContext } from '../contexts/sidePanelContextValue'

export const useSidePanelTriggers = () => {
  const context = useContext(SidePanelContext)
  if (!context) {
    throw new Error(
      'useSidePanelTriggers must be used within SidePanelProvider'
    )
  }
  return {
    setTrigger: context.setTrigger,
    getTrigger: context.getTrigger,
  }
}
