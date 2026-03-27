import { useSnapshot } from 'valtio'
import { layoutStore } from '@/stores/layout'

export const useReactionsToolbar = () => {
  const layoutSnap = useSnapshot(layoutStore)

  return {
    isOpen: layoutSnap.showReactionsToolbar,
    toggle: () => {
      layoutStore.showReactionsToolbar = !layoutSnap.showReactionsToolbar
    },
  }
}
