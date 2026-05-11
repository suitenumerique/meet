import { useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useFocusManager } from '@react-aria/focus'
import { findFirstFocusable } from '@/utils/dom'
import { useReactionsToolbar } from '../../hooks/useReactionsToolbar'
import { REACTIONS_TOOLBAR_ID } from '../../constants'

type Props = {
  children: ReactNode
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
  const rootRef = useRef<HTMLDivElement>(null)
  const { close } = useReactionsToolbar()

  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    const fromOutside = !event.currentTarget.contains(event.relatedTarget)
    if (fromOutside) focusManager?.focusFirst()
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const doc = rootRef.current?.ownerDocument ?? document

    switch (event.key) {
      case 'ArrowRight':
        focusManager?.focusNext({ wrap: true })
        break
      case 'ArrowLeft':
        focusManager?.focusPrevious({ wrap: true })
        break
      case 'Escape':
        event.preventDefault()
        doc.getElementById(toggleId)?.focus()
        close()
        break
      case 'Tab':
        if (!event.shiftKey) {
          event.preventDefault()
          findFirstFocusable(doc.getElementById(controlBarId))?.focus()
        }
        break
    }
  }

  return (
    <div
      ref={rootRef}
      id={REACTIONS_TOOLBAR_ID}
      role="toolbar"
      aria-label={t('toolbar')}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  )
}
