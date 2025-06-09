import { proxy } from 'valtio'

type State = {
  isNoiseSuppressionEnabled: boolean
}

export const settingsStore = proxy<State>({
  isNoiseSuppressionEnabled: false,
})
