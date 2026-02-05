import { useCallback } from 'react'
import type { SidePanelTriggerKey } from '../types/sidePanelTypes'
import { useSidePanelTriggers } from './useSidePanelTriggers'

export const useSidePanelTriggerRef = (key: SidePanelTriggerKey) => {
  const { setTrigger } = useSidePanelTriggers()
  return useCallback(
    (el: HTMLElement | null) => {
      setTrigger(key, el)
    },
    [key, setTrigger]
  )
}

