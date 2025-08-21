import { useSettingsDialog } from '../SettingsDialogContext'
import { Button } from '@/primitives'
import { RiSettings3Line } from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import { SettingsDialogExtendedKey } from '@/features/settings/type'

export const SettingsButton = ({
  settingTab,
}: {
  settingTab: SettingsDialogExtendedKey
}) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'selectDevice' })
  const { setDialogOpen, setDefaultSelectedKey } = useSettingsDialog()

  return (
    <Button
      size="sm"
      square
      tooltip={t(`settings.${settingTab}`)}
      aria-label={t(`settings.${settingTab}`)}
      variant="primaryDark"
      onPress={() => {
        setDefaultSelectedKey(settingTab)
        setDialogOpen(true)
      }}
    >
      <RiSettings3Line size={24} />
    </Button>
  )
}
