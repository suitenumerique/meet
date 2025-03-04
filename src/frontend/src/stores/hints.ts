import { proxy } from 'valtio'

type State = {
  showLoginHint: boolean
}

export const hintsStore = proxy<State>({
  showLoginHint: false,
})
