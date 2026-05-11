import { useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { RiEmotionLine } from '@remixicon/react'
import { ToggleButton } from '@/primitives'

import { useRegisterKeyboardShortcut } from '@/features/shortcuts/useRegisterKeyboardShortcut'
import { REACTIONS_TOOLBAR_ID } from '../constants'
import { useReactionsToolbar } from '../hooks/useReactionsToolbar'

type ReactionsToggleProps = {
  id?: string
}

export const ReactionsToggle = ({
  id = 'reactions-toggle',
}: ReactionsToggleProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'controls.reactions' })
  const { isOpen, toggle } = useReactionsToolbar()
  const buttonRef = useRef<HTMLButtonElement>(null)

  const handleShortcut = useCallback(() => {
    if (isOpen) {
      const doc = buttonRef.current?.ownerDocument ?? document
      doc
        .getElementById(REACTIONS_TOOLBAR_ID)
        ?.querySelector<HTMLElement>('button')
        ?.focus()
    } else {
      toggle()
    }
  }, [isOpen, toggle])

  useRegisterKeyboardShortcut({ id: 'reaction', handler: handleShortcut })

  return (
    <ToggleButton
      ref={buttonRef}
      id={id}
      data-attr={id}
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
