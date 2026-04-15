import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { RiEmotionLine } from '@remixicon/react'
import { ToggleButton } from '@/primitives'

import { useRegisterKeyboardShortcut } from '@/features/shortcuts/useRegisterKeyboardShortcut'
import { REACTIONS_TOOLBAR_ID } from '../constants'
import { useReactionsToolbar } from '../hooks/useReactionsToolbar'
import { layoutStore } from '@/stores/layout'

const focusReactionsToolbar = () => {
  document
    .getElementById(REACTIONS_TOOLBAR_ID)
    ?.querySelector<HTMLElement>('button')
    ?.focus()
}

export const ReactionsToggle = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'controls.reactions' })

  const { isOpen, toggle } = useReactionsToolbar()

  const handleShortcut = useCallback(() => {
    if (layoutStore.showReactionsToolbar) {
      focusReactionsToolbar()
    } else {
      layoutStore.showReactionsToolbar = true
    }
  }, [])

  useRegisterKeyboardShortcut({
    id: 'reaction',
    handler: handleShortcut,
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
