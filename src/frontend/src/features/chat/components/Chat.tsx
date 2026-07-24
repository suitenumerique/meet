import { useTranslation } from 'react-i18next'
import { Text } from '@/primitives'
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
      <ChatTextArea />
    </ChatContainer>
  )
}
