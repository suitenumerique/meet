import { layoutStore } from '@/stores/layout'
import type { SidePanelTriggerKey } from '../types/sidePanelTypes'

export const useSidePanelTriggers = () => {
  return {
    setTrigger: (key: SidePanelTriggerKey, el: HTMLElement | null) => {
      layoutStore.sidePanelTriggers[key] = el
    },
    getTrigger: (key: SidePanelTriggerKey) => {
      return layoutStore.sidePanelTriggers[key] ?? null
    },
  }
}
