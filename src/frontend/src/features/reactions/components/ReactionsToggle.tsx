import { useTranslation } from 'react-i18next'
import { RiEmotionLine } from '@remixicon/react'
import { ToggleButton } from '@/primitives'

import { useRegisterKeyboardShortcut } from '@/features/shortcuts/useRegisterKeyboardShortcut'
import { REACTIONS_TOOLBAR_ID } from '../constants'
import { useReactionsToolbar } from '../hooks/useReactionsToolbar'
import { layoutStore } from '@/stores/layout'
import { type ButtonRecipeProps } from '@/primitives/buttonRecipe'
import { ToggleButtonProps } from '@/primitives/ToggleButton'

const focusReactionsToolbar = () => {
  document
    .getElementById(REACTIONS_TOOLBAR_ID)
    ?.querySelector<HTMLElement>('button')
    ?.focus()
}

export const REACTIONS_TOGGLE_ID = 'reactions-toggle'

/* eslint-disable react-refresh/only-export-components */
export const reactionShortcutHandler = () => {
  if (layoutStore.showReactionsToolbar) {
    focusReactionsToolbar()
  } else {
    layoutStore.showReactionsToolbar = true
  }
}

type Props = Pick<NonNullable<ButtonRecipeProps>, 'variant'> & ToggleButtonProps

export const ReactionsToggle = ({
  variant = 'primaryDark',
  onPress,
  ...props
}: Props) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'controls.reactions' })

  const { isOpen, toggle } = useReactionsToolbar()

  useRegisterKeyboardShortcut({
    id: 'reaction',
    handler: reactionShortcutHandler,
  })

  return (
    <ToggleButton
      {...props}
      id={REACTIONS_TOGGLE_ID}
      data-attr="reactions-toggle"
      square
      variant={variant}
      aria-label={t('button')}
      aria-expanded={isOpen}
      tooltip={t('button')}
      isSelected={isOpen}
      onChange={toggle}
      onPress={onPress}
    >
      <RiEmotionLine />
    </ToggleButton>
  )
}
