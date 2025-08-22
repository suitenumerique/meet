import { Button } from '@/primitives'
import { RiSettings3Line } from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import { SettingsDialogExtendedKey } from '@/features/settings/type'
import { useSettingsDialog } from '@/features/settings/hook/useSettingsDialog'

export const SettingsButton = ({
  settingTab,
  onPress,
}: {
  settingTab: SettingsDialogExtendedKey
  onPress?: () => void
}) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'selectDevice' })
  const { openSettingsDialog } = useSettingsDialog()

  return (
    <Button
      size="sm"
      square
      tooltip={t(`settings.${settingTab}`)}
      aria-label={t(`settings.${settingTab}`)}
      variant="primaryDark"
      onPress={() => {
        openSettingsDialog(settingTab)
        onPress?.()
      }}
    >
      <RiSettings3Line size={24} />
    </Button>
  )
}
