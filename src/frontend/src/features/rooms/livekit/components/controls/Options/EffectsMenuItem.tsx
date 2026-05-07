import { RiImageCircleAiFill } from '@remixicon/react'
import { MenuItem } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { menuRecipe } from '@/primitives/menuRecipe'
import { useSidePanel } from '../../../hooks/useSidePanel'

export const EffectsMenuItem = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'options.items' })
  const { toggleEffects } = useSidePanel()

  return (
    <MenuItem
      onAction={() => toggleEffects()}
      className={menuRecipe({ icon: true, variant: 'dark' }).item}
    >
      <RiImageCircleAiFill size={20} />
      {t('effects')}
    </MenuItem>
  )
}
