import { proxy } from 'valtio'

type State = {
  window: Window | null
}

export const documentPictureInPictureStore = proxy<State>({
  window: null,
})
