import { RiMegaphoneLine } from '@remixicon/react'
import { MenuItem } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { menuRecipe } from '@/primitives/menuRecipe'
import { GRIST_FEEDBACKS_FORM } from '@/utils/constants'

export const FeedbackMenuItem = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'options.items' })

  return (
    <MenuItem
      href={GRIST_FEEDBACKS_FORM}
      target="_blank"
      className={menuRecipe({ icon: true, variant: 'dark' }).item}
    >
      <RiMegaphoneLine size={20} />
      {t('feedback')}
    </MenuItem>
  )
}
