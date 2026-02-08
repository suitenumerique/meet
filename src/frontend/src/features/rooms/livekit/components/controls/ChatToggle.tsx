import { useTranslation } from 'react-i18next'
import { RiChat1Line } from '@remixicon/react'
import { useSnapshot } from 'valtio'
import { css } from '@/styled-system/css'
import { ToggleButton } from '@/primitives'
import { chatStore } from '@/stores/chat'
import { useSidePanel } from '../../hooks/useSidePanel'
import { ToggleButtonProps } from '@/primitives/ToggleButton'
import { useRegisterKeyboardShortcut } from '@/features/shortcuts/useRegisterKeyboardShortcut'

export const ChatToggle = ({
  onPress,
  ...props
}: Partial<ToggleButtonProps>) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'controls.chat' })

  const chatSnap = useSnapshot(chatStore)

  const { isChatOpen, toggleChat } = useSidePanel()
  const tooltipLabel = isChatOpen ? 'open' : 'closed'

  useRegisterKeyboardShortcut({
    shortcutId: 'toggle-chat',
    handler: async () => toggleChat(),
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
        onPress={(e) => {
          toggleChat()
          onPress?.(e)
        }}
        data-attr={`controls-chat-${tooltipLabel}`}
        {...props}
      >
        <RiChat1Line />
      </ToggleButton>
      {!!chatSnap.unreadMessages && (
        <div
          className={css({
            position: 'absolute',
            top: '-.25rem',
            right: '-.25rem',
            width: '1rem',
            height: '1rem',
            backgroundColor: 'alert.notification',
            borderRadius: '50%',
            zIndex: 1,
            border: '2px solid',
            borderColor: 'greyscale.250',
          })}
        />
      )}
    </div>
  )
}
