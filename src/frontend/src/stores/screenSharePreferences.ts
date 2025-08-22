import { proxy } from 'valtio'

type State = {
  enabled: boolean
}

export const screenSharePreferenceStore = proxy<State>({
  enabled: true,
})
