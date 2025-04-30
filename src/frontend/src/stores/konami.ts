import { proxy } from 'valtio'

type State = {
  areFunnyEffectsEnabled: boolean
}

export const konamiStore = proxy<State>({
  areFunnyEffectsEnabled: false,
})
