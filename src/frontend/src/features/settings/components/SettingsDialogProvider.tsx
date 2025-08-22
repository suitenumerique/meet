import { SettingsDialogExtended } from './SettingsDialogExtended'
import { useSnapshot } from 'valtio'
import { settingsStore } from '@/stores/settings'

export const SettingsDialogProvider = () => {
  const { areSettingsOpen, defaultSelectedTab } = useSnapshot(settingsStore)

  return (
    <SettingsDialogExtended
      isOpen={areSettingsOpen}
      defaultSelectedTab={defaultSelectedTab}
      onOpenChange={(v) => {
        if (!v && settingsStore.defaultSelectedTab) {
          settingsStore.defaultSelectedTab = undefined
        }
        settingsStore.areSettingsOpen = v
      }}
    />
  )
}
