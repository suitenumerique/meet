import { RiBookOpenLine } from '@remixicon/react'
import { MenuItem } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { menuRecipe } from '@/primitives/menuRecipe'
import { useConfig } from '@/api/useConfig'

export const DocumentationMenuItem = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'options.items' })
  const { data } = useConfig()

  if (!data?.documentation_url) return

  return (
    <MenuItem
      href={data.documentation_url}
      target="_blank"
      className={menuRecipe({ icon: true, variant: 'dark' }).item}
    >
      <RiBookOpenLine size={20} />
      {t('documentation')}
    </MenuItem>
  )
}
