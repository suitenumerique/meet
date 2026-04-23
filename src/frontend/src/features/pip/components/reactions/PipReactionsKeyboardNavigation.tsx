import { useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useFocusManager } from '@react-aria/focus'
import { findFirstFocusable } from '@/utils/dom'
import { pipLayoutStore } from '@/features/pip/stores/pipLayoutStore'
import { useEscapeDismiss } from '@/features/pip/hooks/useEscapeDismiss'

const REACTIONS_TOGGLE_ID = 'pip-reactions-toggle'
const CONTROL_BAR_ID = 'pip-control-bar'

const closeToolbar = () => {
  pipLayoutStore.showReactionsToolbar = false
}

/** Keyboard navigation for the PiP reactions toolbar (mirrors the main app). */
export const PipReactionsKeyboardNavigation = ({
  children,
}: {
  children: ReactNode
}) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'controls.reactions' })
  const focusManager = useFocusManager()
  const rootRef = useRef<HTMLDivElement>(null)

  useEscapeDismiss(rootRef, true, () => {
    const doc = rootRef.current?.ownerDocument ?? document
    doc.getElementById(REACTIONS_TOGGLE_ID)?.focus()
    closeToolbar()
  })

  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    const fromOutside = !event.currentTarget.contains(event.relatedTarget)
    if (fromOutside) focusManager?.focusFirst()
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowRight':
        focusManager?.focusNext({ wrap: true })
        break
      case 'ArrowLeft':
        focusManager?.focusPrevious({ wrap: true })
        break
      case 'Tab':
        if (!event.shiftKey) {
          event.preventDefault()
          const doc = rootRef.current?.ownerDocument ?? document
          findFirstFocusable(doc.getElementById(CONTROL_BAR_ID))?.focus()
        }
        break
    }
  }

  return (
    <div
      ref={rootRef}
      role="toolbar"
      aria-label={t('toolbar')}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  )
}
