import { RiQuestionLine } from '@remixicon/react'
import { MenuItem } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { menuRecipe } from '@/primitives/menuRecipe'
import { useSupportWidget } from '@/features/support/hooks/useSupportWidget'

export const SupportMenuItem = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'options.items' })
  const { isEnabled, open } = useSupportWidget()

  if (!isEnabled) return

  return (
    <MenuItem
      className={menuRecipe({ icon: true, variant: 'dark' }).item}
      onAction={open}
    >
      <RiQuestionLine size={20} />
      {t('support')}
    </MenuItem>
  )
}
