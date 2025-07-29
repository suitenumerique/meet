import { useSnapshot } from 'valtio'
import { ModalsState, modalsStore } from '@/stores/modals'

interface UseModalReturn {
  isOpen: () => boolean
  open: () => void
  close: () => void
}

export const useModal = (name: keyof ModalsState): UseModalReturn => {
  const modalsSnap = useSnapshot(modalsStore)

  const isOpen = (): boolean => {
    return modalsSnap[name] as boolean
  }

  return {
    isOpen,
    open: () => (modalsStore[name] = true),
    close: () => (modalsStore[name] = false),
  }
}
