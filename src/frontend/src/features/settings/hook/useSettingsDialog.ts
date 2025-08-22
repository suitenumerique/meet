import { useSnapshot } from 'valtio/index'
import { settingsStore } from '@/stores/settings'
import { SettingsDialogExtendedKey } from '@/features/settings/type'

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

  return {
    openSettingsDialog,
  }
}
