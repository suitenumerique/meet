import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { RiEmotionLine } from '@remixicon/react'
import { ToggleButton } from '@/primitives'
import { useSnapshot } from 'valtio'
import { pipLayoutStore } from '../stores/pipLayoutStore'
import { useRegisterKeyboardShortcut } from '@/features/shortcuts/useRegisterKeyboardShortcut'

export const PipReactionsToggle = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'controls.reactions' })
  const { showReactionsToolbar: isOpen } = useSnapshot(pipLayoutStore)

  const toggle = useCallback(() => {
    pipLayoutStore.showReactionsToolbar = !pipLayoutStore.showReactionsToolbar
  }, [])

  useRegisterKeyboardShortcut({ id: 'reaction', handler: toggle })

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
