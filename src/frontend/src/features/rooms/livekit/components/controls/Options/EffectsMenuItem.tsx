import { RiImageCircleAiFill } from '@remixicon/react'
import { MenuItem } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { menuRecipe } from '@/primitives/menuRecipe'
import { type SidePanelStore, useSidePanel } from '../../../hooks/useSidePanel'

export const EffectsMenuItem = ({ store }: { store?: SidePanelStore }) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'options.items' })
  const { toggleEffects } = useSidePanel(store)

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
