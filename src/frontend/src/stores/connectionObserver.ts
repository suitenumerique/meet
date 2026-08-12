import { proxy } from 'valtio'

type State = {
  isIdleDisconnectModalOpen: boolean
}

export const connectionObserverStore = proxy<State>({
  isIdleDisconnectModalOpen: false,
})
