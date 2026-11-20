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

export const Chat = () => {
  return (
    <ChatContainer>
      <ChatMessagesContainer>
        <ChatMessages />
      </ChatMessagesContainer>
      <ChatTextArea />
    </ChatContainer>
  )
}
