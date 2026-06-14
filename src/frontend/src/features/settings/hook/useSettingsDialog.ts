import { useSnapshot } from 'valtio'
import { settingsStore } from '@/stores/settings'
import type { SettingsDialogExtendedKey } from '@/features/settings/type'

export const useSettingsDialog = () => {
  const { areSettingsOpen } = useSnapshot(settingsStore)

  const openSettingsDialog = (
    defaultSelectedTab?: SettingsDialogExtendedKey
  ) => {
    if (areSettingsOpen) return
    if (defaultSelectedTab)
      settingsStore.defaultSelectedTab = defaultSelectedTab
    settingsStore.areSettingsOpen = true
  }

  const closeSettingsDialog = () => {
    settingsStore.areSettingsOpen = false
  }

  const toggleSettingsDialog = (
    defaultSelectedTab?: SettingsDialogExtendedKey
  ) => {
    if (areSettingsOpen) {
      closeSettingsDialog()
    } else {
      if (defaultSelectedTab)
        settingsStore.defaultSelectedTab = defaultSelectedTab
      settingsStore.areSettingsOpen = true
    }
  }

  return {
    openSettingsDialog,
    closeSettingsDialog,
    toggleSettingsDialog,
  }
}
