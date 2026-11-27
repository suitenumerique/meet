import { css } from '@/styled-system/css'
import { Button, Icon } from '@/primitives'
import { useTranslation } from 'react-i18next'
import { SettingsDialogExtendedKey } from '@/features/settings/type'
import { openSettingsDialog } from '@/stores/settings'

export const SettingsButton = ({
  settingTab,
  onPress,
}: {
  settingTab: SettingsDialogExtendedKey
  onPress?: () => void
}) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'selectDevice' })

  return (
    <Button
      size="sm"
      square
      tooltip={t(`settings.${settingTab}`)}
      aria-label={t(`settings.${settingTab}`)}
      variant="primaryTextDark"
      className={css({ flexShrink: 0 })}
      onPress={() => {
        openSettingsDialog(settingTab)
        onPress?.()
      }}
    >
      <Icon name="gear-rounded" />
    </Button>
  )
}
