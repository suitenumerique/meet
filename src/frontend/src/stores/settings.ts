import { proxy } from 'valtio'
import { SettingsDialogExtendedKey } from '@/features/settings/type'

type State = {
  areSettingsOpen: boolean
  defaultSelectedTab?: SettingsDialogExtendedKey
}

export const settingsStore = proxy<State>({
  areSettingsOpen: false,
  defaultSelectedTab: undefined,
})
