import { useTranslation } from 'react-i18next'
import { RiEmotionLine } from '@remixicon/react'
import { ToggleButton } from '@/primitives'
import { useSnapshot } from 'valtio'
import { pipLayoutStore } from '../stores/pipLayoutStore'

export const PipReactionsToggle = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'controls.reactions' })
  const { showReactionsToolbar: isOpen } = useSnapshot(pipLayoutStore)

  const toggle = () => {
    pipLayoutStore.showReactionsToolbar = !pipLayoutStore.showReactionsToolbar
  }

  return (
    <ToggleButton
      id="pip-reactions-toggle"
      data-attr="pip-reactions-toggle"
      square
      variant="primaryDark"
      aria-label={t('button')}
      aria-expanded={isOpen}
      tooltip={t('button')}
      isSelected={isOpen}
      onChange={toggle}
    >
      <RiEmotionLine />
    </ToggleButton>
  )
}
