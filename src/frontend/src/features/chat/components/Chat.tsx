import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import { Text } from '@/primitives'
import { Switch } from '@/primitives/Switch'
import { chatStore } from '@/stores/chat'
import { useBreakoutGroup } from '@/features/breakout/hooks/useBreakoutGroup'
import { useIsAdminOrOwner } from '@/features/rooms/livekit/hooks/useIsAdminOrOwner'
import { ChatMessages } from './ChatMessages'
import { ChatTextArea } from './ChatTextArea'
import { styled } from '@/styled-system/jsx'

const ChatContainer = styled('div', {
  base: {
    display: 'flex',
    padding: '0 1.5rem',
    flexGrow: 1,
    flexDirection: 'column',
    minHeight: 0,
  },
})

const ChatMessagesContainer = styled('div', {
  base: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    minHeight: 0,
  },
})

const TextContainer = styled('div', {
  base: {
    display: 'flex',
    padding: '0.75rem',
    backgroundColor: 'greyscale.50',
    borderRadius: 4,
    marginBottom: '0.75rem',
  },
})

// A host in the main room, while rooms are open, can write to every room.
const EveryRoomSwitch = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'chat.everyRoom' })
  const { toEveryRoom } = useSnapshot(chatStore)
  const { isInMainRoom } = useBreakoutGroup()
  const isHost = useIsAdminOrOwner()
  if (!isInMainRoom || !isHost) return null
  return (
    <Switch
      isSelected={toEveryRoom}
      onChange={(selected) => (chatStore.toEveryRoom = selected)}
    >
      <Text variant="sm">{t('label')}</Text>
    </Switch>
  )
}

export const Chat = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'chat' })

  return (
    <ChatContainer>
      <TextContainer>
        <Text variant="sm">{t('disclaimer')}</Text>
      </TextContainer>
      <ChatMessagesContainer>
        <ChatMessages />
      </ChatMessagesContainer>
      <EveryRoomSwitch />
      <ChatTextArea />
    </ChatContainer>
  )
}
