import { useTranslation } from 'react-i18next'
import { RiEmotionLine } from '@remixicon/react'
import { ToggleButton } from '@/primitives'

import { useRegisterKeyboardShortcut } from '@/features/shortcuts/useRegisterKeyboardShortcut'
import { useReactionsToolbar } from '../hooks/useReactionsToolbar'

export const ReactionsToggle = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'controls.reactions' })

  const { isOpen, toggle } = useReactionsToolbar()

  useRegisterKeyboardShortcut({
    id: 'reaction',
    handler: toggle,
  })

  return (
    <ToggleButton
      id="reactions-toggle"
      data-attr="reactions-toggle"
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
