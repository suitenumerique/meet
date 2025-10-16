import { proxy } from 'valtio'

type State = {
  is_idle_disconnect_modal_enabled: boolean
}

export const userPreferencesStore = proxy<State>({
  is_idle_disconnect_modal_enabled: true,
})
