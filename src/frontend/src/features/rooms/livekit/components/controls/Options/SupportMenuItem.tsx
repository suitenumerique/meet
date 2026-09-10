import { RiQuestionLine } from '@remixicon/react'
import { MenuItem } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { menuRecipe } from '@/primitives/menuRecipe'
import {
  useIsSupportEnabled,
  openSupportChat,
} from '@/features/support/hooks/useSupport'

export const SupportMenuItem = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'options.items' })
  const isSupportEnabled = useIsSupportEnabled()

  if (!isSupportEnabled) {
    return
  }

  return (
    <MenuItem
      className={menuRecipe({ icon: true, variant: 'dark' }).item}
      onAction={openSupportChat}
    >
      <RiQuestionLine size={20} />
      {t('support')}
    </MenuItem>
  )
}
