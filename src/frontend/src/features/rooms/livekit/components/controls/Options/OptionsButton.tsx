import { useTranslation } from 'react-i18next'
import { Button, Menu, Icon } from '@/primitives'
import { OptionsMenuItems } from './OptionsMenuItems'

export const OptionsButton = () => {
  const { t } = useTranslation('rooms')

  return (
    <Menu variant="dark" dropdown>
      <Button
        id="room-options-trigger"
        square
        variant="primaryDark"
        aria-label={t('options.buttonLabel')}
        tooltip={t('options.buttonLabel')}
      >
        <Icon name="more" />
      </Button>
      <OptionsMenuItems />
    </Menu>
  )
}
