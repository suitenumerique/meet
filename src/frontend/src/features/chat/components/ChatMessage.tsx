import type { ChatRow } from '@/stores/chat'
import { styled } from '@/styled-system/jsx'
import { ChatMessageMetadata } from './ChatMessageMedata'
import { ChatMessageBody } from './ChatMessageBody'
import { ChatMessageImage } from './ChatMessageImage'

const StyledContainer = styled('li', {
  base: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
})

type ChatMessageProps = {
  item: ChatRow
}

export const ChatMessage = ({ item }: ChatMessageProps) => {
  const time = new Date(item.timestamp)
  const locale = navigator ? navigator.language : 'en-US'
  return (
    <StyledContainer
      title={time.toLocaleTimeString(locale, { timeStyle: 'full' })}
    >
      {!item.hideMetadata && (
        <ChatMessageMetadata
          timestamp={item.timestamp}
          identity={item.identity}
        />
      )}
      {item.kind === 'text' ? (
        <ChatMessageBody message={item.message} />
      ) : (
        <ChatMessageImage item={item} />
      )}
    </StyledContainer>
  )
}
