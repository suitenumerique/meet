import { MenuItem } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { menuRecipe } from '@/primitives/menuRecipe'
import { openSettingsDialog } from '@/stores/settings'
import { Icon } from '@/primitives/Icon'

export const SettingsMenuItem = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'options.items' })

  return (
    <MenuItem
      className={menuRecipe({ icon: true, variant: 'dark' }).item}
      onAction={() => openSettingsDialog()}
    >
      <Icon name="gear-rounded" size={20} />
      {t('settings')}
    </MenuItem>
  )
}
