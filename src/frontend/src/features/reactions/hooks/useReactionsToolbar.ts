import { createContext, useContext } from 'react'
import { useSnapshot } from 'valtio'
import { layoutStore } from '@/stores/layout'

export type ReactionsToolbarStore = {
  showReactionsToolbar: boolean
}

const ReactionsToolbarStoreContext =
  createContext<ReactionsToolbarStore>(layoutStore)

export const ReactionsToolbarStoreProvider =
  ReactionsToolbarStoreContext.Provider

export const useReactionsToolbar = () => {
  const store = useContext(ReactionsToolbarStoreContext)
  const snap = useSnapshot(store)

  return {
    isOpen: snap.showReactionsToolbar,
    toggle: () => {
      store.showReactionsToolbar = !store.showReactionsToolbar
    },
    close: () => {
      store.showReactionsToolbar = false
    },
  }
}
