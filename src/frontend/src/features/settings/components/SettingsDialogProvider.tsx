import { SettingsDialogExtended } from './SettingsDialogExtended'
import { useSnapshot } from 'valtio'
import { settingsStore, toggleSettingsDialog } from '@/stores/settings'
import {
  SettingsDialogExtendedKey,
} from '@/features/settings'
import { useRegisterKeyboardShortcut } from '@/features/shortcuts/useRegisterKeyboardShortcut'
import { useCallback } from 'react'

export const SettingsDialogProvider = () => {
  const { areSettingsOpen, defaultSelectedTab } = useSnapshot(settingsStore)

  useRegisterKeyboardShortcut({
    id: 'open-shortcuts',
    handler: useCallback(() => {
      toggleSettingsDialog(SettingsDialogExtendedKey.SHORTCUTS)
    }, []),
  })

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
