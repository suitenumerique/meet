import { Menu as RACMenu } from 'react-aria-components'

import { useTranslation } from 'react-i18next'
import { RiMore2Line } from '@remixicon/react'
import { Button, Menu } from '@/primitives'
import { OptionsMenuItems } from './OptionsMenuItems'
import { EffectsMenuItem } from '@/features/rooms/livekit/components/controls/Options/EffectsMenuItem'

// @todo try refactoring it to use MenuList component
export const PiPOptionsMenuItems = () => {
  return (
    <RACMenu
      style={{
        minWidth: '150px',
        width: '300px',
      }}
    >
      <EffectsMenuItem />
    </RACMenu>
  )
}

export const PiPOptionsButton = () => {
  const { t } = useTranslation('rooms')

  return (
    <Menu variant="dark">
      <Button
        size="xs"
        variant="primaryDark"
        aria-label={t('options.buttonLabel')}
        tooltip={t('options.buttonLabel')}
      >
        <RiMore2Line />
      </Button>
      <PiPOptionsMenuItems />
    </Menu>
  )
}
