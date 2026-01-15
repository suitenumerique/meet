import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { RiMoreFill } from '@remixicon/react'
import { Button, Menu } from '@/primitives'
import { OptionsMenuItems } from './OptionsMenuItems'
import { useSidePanelTriggers } from '../../../hooks/useSidePanelTriggers'

export const OptionsButton = () => {
  const { t } = useTranslation('rooms')
  const { setTrigger } = useSidePanelTriggers()
  const setOptionsTriggerRef = useCallback(
    (el: HTMLElement | null) => {
      setTrigger('options', el)
    },
    [setTrigger]
  )

  return (
    <Menu variant="dark">
      <Button
        id="room-options-trigger"
        square
        variant="primaryDark"
        aria-label={t('options.buttonLabel')}
        tooltip={t('options.buttonLabel')}
        ref={setOptionsTriggerRef}
      >
        <RiMoreFill />
      </Button>
      <OptionsMenuItems />
    </Menu>
  )
}
