import { useTranslation } from 'react-i18next'
import { useFocusManager } from '@react-aria/focus'
import { getFirstControlBarFocusable } from '@/utils/dom'
import { REACTIONS_TOOLBAR_ID } from '../../constants'
import { useReactionsToolbar } from '../../hooks/useReactionsToolbar'

type Props = {
  children: React.ReactNode
  toggleId?: string
  controlBarId?: string
}

export const ReactionsKeyboardNavigation = ({
  children,
  toggleId = 'reactions-toggle',
  controlBarId = 'control-bar',
}: Props) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'controls.reactions' })
  const focusManager = useFocusManager()
  const { close } = useReactionsToolbar()

  const onFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    const comingFromOutside = !e.currentTarget.contains(e.relatedTarget)
    if (comingFromOutside) {
      focusManager?.focusFirst()
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case 'ArrowRight':
        focusManager?.focusNext({ wrap: true })
        break
      case 'ArrowLeft':
        focusManager?.focusPrevious({ wrap: true })
        break
      case 'Escape':
        e.preventDefault()
        document.getElementById(toggleId)?.focus()
        close()
        break
      case 'Tab':
        if (!e.shiftKey) {
          e.preventDefault()
          getFirstControlBarFocusable(controlBarId)?.focus()
        }
        break
    }
  }

  return (
    <div
      id={REACTIONS_TOOLBAR_ID}
      role="toolbar"
      aria-label={t('toolbar')}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
    >
      {children}
    </div>
  )
}
