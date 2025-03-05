import { useTranslation } from 'react-i18next'
import { RiMoreFill } from '@remixicon/react'
import { Button, Menu } from '@/primitives'
import { OptionsMenuItems } from './OptionsMenuItems'

export const OptionsButton = () => {
  const { t } = useTranslation('rooms')

  return (
    <>
      <Menu variant="dark">
        <Button
          square
          variant="primaryDark"
          aria-label={t('options.buttonLabel')}
          tooltip={t('options.buttonLabel')}
        >
          <RiMoreFill />
        </Button>
        <OptionsMenuItems />
      </Menu>
    </>
  )
}
