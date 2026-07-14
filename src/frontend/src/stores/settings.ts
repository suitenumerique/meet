import { proxy } from 'valtio'
import type { SettingsDialogExtendedKey } from '@/features/settings/type'

type State = {
  areSettingsOpen: boolean
  defaultSelectedTab?: SettingsDialogExtendedKey
}

export const settingsStore = proxy<State>({
  areSettingsOpen: false,
  defaultSelectedTab: undefined,
})

export const openSettingsDialog = (
  defaultSelectedTab?: SettingsDialogExtendedKey
) => {
  if (settingsStore.areSettingsOpen) return
  if (defaultSelectedTab) settingsStore.defaultSelectedTab = defaultSelectedTab
  settingsStore.areSettingsOpen = true
}

export const closeSettingsDialog = () => {
  settingsStore.areSettingsOpen = false
}

export const toggleSettingsDialog = (
  defaultSelectedTab?: SettingsDialogExtendedKey
) => {
  if (settingsStore.areSettingsOpen) {
    closeSettingsDialog()
  } else {
    openSettingsDialog(defaultSelectedTab)
  }
}
