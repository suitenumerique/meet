import { RiMegaphoneLine } from '@remixicon/react'
import { MenuItem } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { menuRecipe } from '@/primitives/menuRecipe'
import { useConfig } from '@/api/useConfig'

export const FeedbackMenuItem = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'options.items' })
  const { data } = useConfig()

  if (!data?.feedback?.url) return

  return (
    <MenuItem
      href={data?.feedback?.url}
      target="_blank"
      className={menuRecipe({ icon: true, variant: 'dark' }).item}
    >
      <RiMegaphoneLine size={20} />
      {t('feedback')}
    </MenuItem>
  )
}
