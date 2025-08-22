import { RiSettings3Line } from '@remixicon/react'
import { MenuItem } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { menuRecipe } from '@/primitives/menuRecipe'
import { useSettingsDialog } from '@/features/settings/hook/useSettingsDialog'

export const SettingsMenuItem = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'options.items' })
  const { openSettingsDialog } = useSettingsDialog()

  return (
    <MenuItem
      className={menuRecipe({ icon: true, variant: 'dark' }).item}
      onAction={() => openSettingsDialog()}
    >
      <RiSettings3Line size={20} />
      {t('settings')}
    </MenuItem>
  )
}
