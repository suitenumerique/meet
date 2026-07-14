import { RiSettings3Line } from '@remixicon/react'
import { MenuItem } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { menuRecipe } from '@/primitives/menuRecipe'
import { openSettingsDialog } from '@/stores/settings'

export const SettingsMenuItem = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'options.items' })

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
