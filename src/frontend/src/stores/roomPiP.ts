import { proxy } from 'valtio'

type State = {
  isOpen: boolean
}

export const roomPiPStore = proxy<State>({
  isOpen: false,
})
