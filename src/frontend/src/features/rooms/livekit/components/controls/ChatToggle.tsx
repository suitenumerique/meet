import { useTranslation } from 'react-i18next'
import { RiChat1Fill, RiChat1Line } from '@remixicon/react'
import { useSnapshot } from 'valtio'
import { css } from '@/styled-system/css'
import { ToggleButton } from '@/primitives'
import { chatStore } from '@/stores/chat'
import { useSidePanel } from '../../hooks/useSidePanel'
import type { ToggleButtonProps } from '@/primitives/ToggleButton'
import { useRegisterKeyboardShortcut } from '@/features/shortcuts/useRegisterKeyboardShortcut'

// Tells there are unread messages, in the "danger" color of the UI kit.
const unreadDot = css({
  position: 'absolute',
  top: '2px',
  right: '2px',
  zIndex: 1,
  width: '0.625rem',
  height: '0.625rem',
  borderRadius: '50%',
  backgroundColor: 'background.semantic.error.primary',
  pointerEvents: 'none',
})

export const ChatToggle = ({
  onPress,
  ...props
}: Partial<ToggleButtonProps>) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'controls.chat' })

  const chatSnap = useSnapshot(chatStore)

  const { isChatOpen, toggleChat } = useSidePanel()
  const tooltipLabel = isChatOpen ? 'open' : 'closed'

  useRegisterKeyboardShortcut({
    id: 'toggle-chat',
    handler: toggleChat,
  })

  return (
    <div
      className={css({
        position: 'relative',
        display: 'inline-block',
      })}
    >
      <ToggleButton
        square
        variant="primaryTextDark"
        aria-label={t(tooltipLabel)}
        tooltip={t(tooltipLabel)}
        isSelected={isChatOpen}
        aria-expanded={isChatOpen}
        onPress={(e) => {
          toggleChat()
          onPress?.(e)
        }}
        data-attr={`controls-chat-${tooltipLabel}`}
        {...props}
      >
        {isChatOpen ? <RiChat1Fill /> : <RiChat1Line />}
      </ToggleButton>
      {!!chatSnap.unreadMessages && (
        <div className={unreadDot} aria-hidden="true" />
      )}
    </div>
  )
}
